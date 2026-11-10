import { createHash } from "node:crypto";
import type {
  Embedder,
  SectionPayload,
  VectorHit,
  VectorPoint,
  VectorSearchFilter,
  VectorStore,
} from "../../src/modules/vector/vector.types.js";

/** Tiny "meaning" model: synonyms collapse onto one concept so paraphrases match. */
const CONCEPTS: Record<string, string> = {
  vacation: "leave", holiday: "leave", holidays: "leave", pto: "leave", leave: "leave",
  incentive: "bonus", payout: "bonus", bonus: "bonus",
  unwell: "sick", ill: "sick", sickness: "sick", sick: "sick",
};
const DIM = 64;
const STOP = new Set("how much what the and are for get can does with our your from that this many".split(" "));

/** Deterministic bag-of-concepts embedding; can be switched to fail like a provider outage. */
export class FakeEmbedder implements Embedder {
  readonly dimensions = DIM;
  failing = false;
  calls = 0;
  async embed(texts: string[]): Promise<number[][]> {
    this.calls++;
    if (this.failing) throw Object.assign(new Error("429 no credits"), { name: "RateLimitError", status: 429 });
    return texts.map((t) => {
      const v = new Array<number>(DIM).fill(0);
      for (const raw of t.toLowerCase().match(/[a-z]+/g) ?? []) {
        if (raw.length < 3 || STOP.has(raw)) continue;
        const word = CONCEPTS[raw] ?? raw;
        v[createHash("sha1").update(word).digest()[0]! % DIM]! += 1;
      }
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  }
}

/** In-memory stand-in with Qdrant's semantics: cosine score, threshold, payload filters. */
export class MemoryVectorStore implements VectorStore {
  points = new Map<string, VectorPoint>();
  failing = false;
  private check() {
    if (this.failing) throw Object.assign(new Error("Vector DB unreachable"), { name: "VectorStoreError" });
  }
  async ensureCollection(): Promise<void> {
    this.check();
  }
  async upsert(points: VectorPoint[]): Promise<void> {
    this.check();
    for (const p of points) this.points.set(p.id, structuredClone(p));
  }
  async search(vector: number[], filter: VectorSearchFilter, limit: number, minScore: number): Promise<VectorHit[]> {
    this.check();
    return [...this.points.values()]
      .filter((p) => filter.documentIds.includes(p.payload.documentId) && filter.accessLevels.includes(p.payload.accessLevel))
      .map((p) => ({ score: p.vector.reduce((s, x, i) => s + x * vector[i]!, 0), payload: p.payload }))
      .filter((h) => h.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  async deleteByDocument(documentId: string): Promise<void> {
    this.check();
    for (const [id, p] of this.points) if (p.payload.documentId === documentId) this.points.delete(id);
  }
  async updateDocumentPayload(documentId: string, payload: Partial<SectionPayload>): Promise<void> {
    this.check();
    for (const p of this.points.values()) if (p.payload.documentId === documentId) Object.assign(p.payload, payload);
  }
  byDocument(documentId: string) {
    return [...this.points.values()].filter((p) => p.payload.documentId === documentId);
  }
}
