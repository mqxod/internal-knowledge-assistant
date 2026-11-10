import type { PipelineStage, Types } from "mongoose";
import type { AccessLevel, UserRole } from "@ika/shared";
import type { AppConfig } from "../../config/env.js";
import type { Logger } from "../../config/logger.js";
import { DocumentModel } from "../documents/document.model.js";
import { SectionModel } from "../documents/section.model.js";
import type { SemanticIndex } from "../vector/semantic-index.service.js";
import { containsTerm, extractKeywords } from "./keywords.js";

export interface RetrievedSection {
  sectionId: string;
  documentId: string;
  documentTitle: string;
  sectionTitle: string;
  headingPath: string[];
  content: string;
  score: number;
  /** Which retriever(s) found this section. */
  matchedBy: ("keyword" | "semantic")[];
}

/**
 * The access filter is derived from the server-side role only. It is applied inside the
 * database query (via the parent document), so restricted sections are never loaded.
 */
export function documentAccessFilter(role: UserRole): { status: "ready"; accessLevel?: AccessLevel } {
  return role === "admin" ? { status: "ready" } : { status: "ready", accessLevel: "all" };
}

export function allowedAccessLevels(role: UserRole): AccessLevel[] {
  return role === "admin" ? ["all", "admin-only"] : ["all"];
}

const CANDIDATE_LIMIT = 40;
/** Standard Reciprocal Rank Fusion constant: dampens the advantage of rank 1 over rank 2. */
const RRF_K = 60;

type Candidate = Omit<RetrievedSection, "score" | "matchedBy">;

export class SearchService {
  constructor(
    private readonly config: AppConfig,
    private readonly semantic: SemanticIndex | null = null,
    private readonly logger?: Logger,
  ) {}

  /**
   * Hybrid retrieval: keyword (MongoDB text index + coverage check) and, when configured,
   * semantic (Qdrant vectors above a similarity floor). Results are fused by rank, then cut to
   * top-K within the context budget. Either retriever alone can surface a section; if the
   * semantic side is unavailable, retrieval degrades to keyword-only instead of failing.
   */
  async search(question: string, role: UserRole): Promise<RetrievedSection[]> {
    const accessFilter = documentAccessFilter(role);
    const allowedDocs = await DocumentModel.find(accessFilter, { _id: 1, title: 1 }).lean();
    if (allowedDocs.length === 0) return [];
    const titles = new Map(allowedDocs.map((d) => [d._id.toString(), d.title]));

    const [keyword, semantic] = await Promise.all([
      this.keywordSearch(question, accessFilter, allowedDocs.map((d) => d._id)),
      this.semanticSearch(question, role, titles),
    ]);

    const fused = new Map<string, { c: Candidate; score: number; matchedBy: RetrievedSection["matchedBy"] }>();
    const add = (list: Candidate[], by: "keyword" | "semantic") =>
      list.forEach((c, rank) => {
        const entry = fused.get(c.sectionId) ?? { c, score: 0, matchedBy: [] };
        entry.score += 1 / (RRF_K + rank + 1);
        entry.matchedBy.push(by);
        fused.set(c.sectionId, entry);
      });
    add(keyword, "keyword");
    add(semantic, "semantic");

    const ranked = [...fused.values()].sort((a, b) => b.score - a.score);
    const selected: RetrievedSection[] = [];
    let budget = this.config.limits.maxContextChars;
    for (const { c, score, matchedBy } of ranked) {
      if (selected.length >= this.config.limits.retrievalTopK) break;
      if (c.content.length > budget) continue;
      budget -= c.content.length;
      selected.push({ ...c, score: Number(score.toFixed(5)), matchedBy });
    }
    this.logger?.debug(
      { keyword: keyword.length, semantic: semantic.length, selected: selected.length },
      "Hybrid retrieval",
    );
    return selected;
  }

  private async keywordSearch(
    question: string,
    accessFilter: Record<string, unknown>,
    allowedDocIds: Types.ObjectId[],
  ): Promise<Candidate[]> {
    const keywords = extractKeywords(question);
    if (keywords.length === 0) return [];

    const pipeline: PipelineStage[] = [
      { $match: { $text: { $search: keywords.join(" ") }, documentId: { $in: allowedDocIds } } },
      { $addFields: { textScore: { $meta: "textScore" } } },
      { $sort: { textScore: -1 } },
      { $limit: CANDIDATE_LIMIT },
      // Re-check the parent at query time so a document that changed access level or status
      // between the two queries can never leak through.
      {
        $lookup: {
          from: DocumentModel.collection.name,
          localField: "documentId",
          foreignField: "_id",
          as: "parent",
          pipeline: [{ $match: accessFilter }, { $project: { _id: 1, title: 1 } }],
        },
      },
      { $match: { "parent.0": { $exists: true } } },
      {
        $project: {
          documentId: 1,
          sectionTitle: 1,
          headingPath: 1,
          content: 1,
          textScore: 1,
          documentTitle: { $arrayElemAt: ["$parent.title", 0] },
        },
      },
    ];

    const candidates = await SectionModel.aggregate<{
      _id: Types.ObjectId;
      documentId: Types.ObjectId;
      documentTitle: string;
      sectionTitle: string;
      headingPath: string[];
      content: string;
      textScore: number;
    }>(pipeline);
    if (candidates.length === 0) return [];

    const maxText = Math.max(...candidates.map((c) => c.textScore));
    return candidates
      .map((c) => {
        const titleText = `${c.sectionTitle} ${c.headingPath.join(" ")}`.toLowerCase();
        const fullText = `${titleText} ${c.documentTitle} ${c.content}`.toLowerCase();
        const coverage = keywords.filter((k) => containsTerm(fullText, k)).length / keywords.length;
        const titleCoverage = keywords.filter((k) => containsTerm(titleText, k)).length / keywords.length;
        const score = 0.55 * coverage + 0.25 * titleCoverage + 0.2 * (c.textScore / maxText);
        return { c, coverage, score };
      })
      .filter((r) => r.coverage >= this.config.limits.minKeywordCoverage)
      .sort((a, b) => b.score - a.score)
      .map(({ c }) => ({
        sectionId: c._id.toString(),
        documentId: c.documentId.toString(),
        documentTitle: c.documentTitle,
        sectionTitle: c.sectionTitle,
        headingPath: c.headingPath,
        content: c.content,
      }));
  }

  /**
   * Qdrant is filtered by the MongoDB-approved document ids *and* the role's access levels, and
   * every hit is checked against that same id set again, so a stale vector payload can never
   * widen access. Titles come from MongoDB so renames apply immediately.
   */
  private async semanticSearch(question: string, role: UserRole, titles: Map<string, string>): Promise<Candidate[]> {
    if (!this.semantic || question.trim().length < 3) return [];
    try {
      const hits = await this.semantic.search(question, [...titles.keys()], allowedAccessLevels(role));
      return hits
        .filter((h) => titles.has(h.payload.documentId))
        .map((h) => ({
          sectionId: h.payload.sectionId,
          documentId: h.payload.documentId,
          documentTitle: titles.get(h.payload.documentId)!,
          sectionTitle: h.payload.sectionTitle,
          headingPath: h.payload.headingPath,
          content: h.payload.content,
        }));
    } catch (err) {
      this.logger?.warn(
        { error: (err as Error).name, status: (err as { status?: number }).status },
        "Semantic search unavailable; using keyword results only",
      );
      return [];
    }
  }
}
