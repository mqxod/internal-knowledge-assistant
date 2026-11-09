import type { PipelineStage, Types } from "mongoose";
import type { UserRole } from "@ika/shared";
import type { AppConfig } from "../../config/env.js";
import { DocumentModel } from "../documents/document.model.js";
import { SectionModel } from "../documents/section.model.js";
import { containsTerm, extractKeywords } from "./keywords.js";

export interface RetrievedSection {
  sectionId: string;
  documentId: string;
  documentTitle: string;
  sectionTitle: string;
  headingPath: string[];
  content: string;
  score: number;
}

/**
 * The access filter is derived from the server-side role only. It is applied inside the
 * database query (via the parent document), so restricted sections are never loaded.
 */
export function documentAccessFilter(role: UserRole): Record<string, unknown> {
  return role === "admin" ? { status: "ready" } : { status: "ready", accessLevel: "all" };
}

const CANDIDATE_LIMIT = 40;

export class SearchService {
  constructor(private readonly config: AppConfig) {}

  async search(question: string, role: UserRole): Promise<RetrievedSection[]> {
    const keywords = extractKeywords(question);
    if (keywords.length === 0) return [];

    const accessFilter = documentAccessFilter(role);
    const allowedDocIds = (await DocumentModel.find(accessFilter).distinct("_id")) as Types.ObjectId[];
    if (allowedDocIds.length === 0) return [];

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
    const ranked = candidates
      .map((c) => {
        const titleText = `${c.sectionTitle} ${c.headingPath.join(" ")}`.toLowerCase();
        const fullText = `${titleText} ${c.documentTitle} ${c.content}`.toLowerCase();
        const coverage = keywords.filter((k) => containsTerm(fullText, k)).length / keywords.length;
        const titleCoverage = keywords.filter((k) => containsTerm(titleText, k)).length / keywords.length;
        const score = 0.55 * coverage + 0.25 * titleCoverage + 0.2 * (c.textScore / maxText);
        return { c, coverage, score };
      })
      .filter((r) => r.coverage >= this.config.limits.minKeywordCoverage)
      .sort((a, b) => b.score - a.score);

    const selected: RetrievedSection[] = [];
    let budget = this.config.limits.maxContextChars;
    for (const { c, score } of ranked) {
      if (selected.length >= this.config.limits.retrievalTopK) break;
      if (c.content.length > budget) continue;
      budget -= c.content.length;
      selected.push({
        sectionId: c._id.toString(),
        documentId: c.documentId.toString(),
        documentTitle: c.documentTitle,
        sectionTitle: c.sectionTitle,
        headingPath: c.headingPath,
        content: c.content,
        score: Number(score.toFixed(4)),
      });
    }
    return selected;
  }
}
