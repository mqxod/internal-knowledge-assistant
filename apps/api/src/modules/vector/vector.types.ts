import type { AccessLevel } from "@ika/shared";

/** Turns text into fixed-size vectors. One call per batch keeps ingestion cheap. */
export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** Everything needed to answer from a vector hit without another database round-trip. */
export interface SectionPayload {
  sectionId: string;
  documentId: string;
  documentTitle: string;
  sectionTitle: string;
  headingPath: string[];
  content: string;
  sectionIndex: number;
  accessLevel: AccessLevel;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: SectionPayload;
}

export interface VectorHit {
  score: number;
  payload: SectionPayload;
}

export interface VectorSearchFilter {
  /** Only these parent documents (already access-checked in MongoDB). */
  documentIds: string[];
  /** Only these access levels (derived from the server-side role). */
  accessLevels: AccessLevel[];
}

export interface VectorStore {
  ensureCollection(dimensions: number): Promise<void>;
  upsert(points: VectorPoint[]): Promise<void>;
  search(vector: number[], filter: VectorSearchFilter, limit: number, minScore: number): Promise<VectorHit[]>;
  deleteByDocument(documentId: string): Promise<void>;
  updateDocumentPayload(documentId: string, payload: Partial<Pick<SectionPayload, "documentTitle" | "accessLevel">>): Promise<void>;
}

/** Qdrant point ids must be unsigned ints or UUIDs: map a 24-hex ObjectId onto a UUID deterministically. */
export function pointIdForSection(sectionId: string): string {
  const hex = sectionId.toLowerCase().padEnd(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
