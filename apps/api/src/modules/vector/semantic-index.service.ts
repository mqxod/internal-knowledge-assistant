import type { AccessLevel } from "@ika/shared";
import type { Types } from "mongoose";
import type { Logger } from "../../config/logger.js";
import { DocumentModel } from "../documents/document.model.js";
import { SectionModel } from "../documents/section.model.js";
import { pointIdForSection, type Embedder, type SectionPayload, type VectorHit, type VectorStore } from "./vector.types.js";

/** Embedding input is capped so one oversized section can't blow the token limit. */
const MAX_EMBED_CHARS = 8000;

export interface IndexableSection {
  _id: Types.ObjectId;
  documentId: Types.ObjectId;
  documentTitle: string;
  sectionTitle: string;
  headingPath: string[];
  content: string;
  sectionIndex: number;
}

export function embeddingText(s: Pick<SectionPayload, "documentTitle" | "headingPath" | "sectionTitle" | "content">): string {
  const path = s.headingPath.length ? s.headingPath.join(" > ") : s.sectionTitle;
  return `${s.documentTitle} > ${path}\n\n${s.content}`.slice(0, MAX_EMBED_CHARS);
}

/**
 * Semantic layer over the section store. MongoDB stays the source of truth for documents,
 * sections and access control; Qdrant holds one vector per section plus a payload copy so a
 * hit can be used without another lookup. Every method is safe to fail: callers fall back to
 * keyword search, and documents that couldn't be embedded are picked up by `backfill`.
 */
export class SemanticIndex {
  private collectionReady: Promise<void> | null = null;

  constructor(
    private readonly embedder: Embedder,
    private readonly store: VectorStore,
    private readonly options: { topK: number; minScore: number },
    private readonly logger: Logger,
  ) {}

  private ready(): Promise<void> {
    this.collectionReady ??= this.store.ensureCollection(this.embedder.dimensions).catch((err) => {
      this.collectionReady = null; // retry on the next call
      throw err;
    });
    return this.collectionReady;
  }

  /** Embeds and stores every section of one document. Throws on failure (caller decides). */
  async indexSections(sections: IndexableSection[], accessLevel: AccessLevel): Promise<void> {
    if (sections.length === 0) return;
    await this.ready();
    const payloads: SectionPayload[] = sections.map((s) => ({
      sectionId: s._id.toString(),
      documentId: s.documentId.toString(),
      documentTitle: s.documentTitle,
      sectionTitle: s.sectionTitle,
      headingPath: s.headingPath,
      content: s.content,
      sectionIndex: s.sectionIndex,
      accessLevel,
    }));
    const vectors = await this.embedder.embed(payloads.map(embeddingText));
    await this.store.upsert(
      payloads.map((payload, i) => ({ id: pointIdForSection(payload.sectionId), vector: vectors[i]!, payload })),
    );
  }

  async search(question: string, documentIds: string[], accessLevels: AccessLevel[]): Promise<VectorHit[]> {
    if (documentIds.length === 0) return [];
    await this.ready();
    const [vector] = await this.embedder.embed([question]);
    return this.store.search(vector!, { documentIds, accessLevels }, this.options.topK, this.options.minScore);
  }

  /** Best effort: orphaned vectors are harmless because search only accepts live, allowed documents. */
  async removeDocument(documentId: Types.ObjectId | string): Promise<void> {
    try {
      await this.ready();
      await this.store.deleteByDocument(documentId.toString());
    } catch (err) {
      this.logger.warn({ documentId: documentId.toString(), error: (err as Error).name }, "Vector delete failed");
    }
  }

  /** Best effort: search re-checks access and titles against MongoDB, so a stale payload can't leak. */
  async updateDocument(
    documentId: Types.ObjectId | string,
    changes: Partial<Pick<SectionPayload, "documentTitle" | "accessLevel">>,
  ): Promise<void> {
    try {
      await this.ready();
      await this.store.updateDocumentPayload(documentId.toString(), changes);
    } catch (err) {
      this.logger.warn({ documentId: documentId.toString(), error: (err as Error).name }, "Vector payload update failed");
    }
  }

  /**
   * Indexes ready documents that have no vectors yet (embedding provider was down, vector DB
   * was added later, or `all` for a full rebuild). Returns how many documents were indexed.
   */
  async backfill(opts: { all?: boolean; limit?: number } = {}): Promise<{ indexed: number; failed: number }> {
    const filter = opts.all ? { status: "ready" as const } : { status: "ready" as const, vectorIndexedAt: null };
    const docs = await DocumentModel.find(filter, { _id: 1, accessLevel: 1 })
      .sort({ createdAt: 1 })
      .limit(opts.limit ?? 1000)
      .lean();
    let indexed = 0;
    let failed = 0;
    for (const doc of docs) {
      try {
        const sections = await SectionModel.find({ documentId: doc._id }).sort({ sectionIndex: 1 }).lean();
        if (opts.all) await this.store.deleteByDocument(doc._id.toString()).catch(() => undefined);
        await this.indexSections(sections as IndexableSection[], doc.accessLevel);
        await DocumentModel.updateOne({ _id: doc._id, status: "ready" }, { $set: { vectorIndexedAt: new Date() } });
        indexed++;
      } catch (err) {
        failed++;
        this.logger.warn(
          { documentId: doc._id.toString(), error: (err as Error).name, status: (err as { status?: number }).status },
          "Vector backfill failed",
        );
        break; // the provider/DB is probably down: stop and retry on the next sweep
      }
    }
    if (indexed) this.logger.info({ indexed }, "Vector backfill complete");
    return { indexed, failed };
  }
}
