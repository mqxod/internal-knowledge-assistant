import type {
  SectionPayload,
  VectorHit,
  VectorPoint,
  VectorSearchFilter,
  VectorStore,
} from "./vector.types.js";

export class VectorStoreError extends Error {
  override name = "VectorStoreError";
}

const UPSERT_BATCH = 128;

/** Minimal Qdrant REST client (no SDK needed for the handful of calls we make). */
export class QdrantStore implements VectorStore {
  constructor(
    private readonly options: { url: string; apiKey?: string | undefined; collection: string; timeoutMs?: number },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get base() {
    return `${this.options.url}/collections/${this.options.collection}`;
  }

  private async call<T>(method: string, url: string, body?: unknown, okStatuses: number[] = []): Promise<{ status: number; data: T | null }> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.apiKey) headers["api-key"] = this.options.apiKey;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (err) {
      throw new VectorStoreError(`Vector DB unreachable (${(err as Error).name})`);
    }
    if (!res.ok && !okStatuses.includes(res.status)) {
      // Never include the response body: it can echo payload content.
      throw new VectorStoreError(`Vector DB request failed (${method} ${res.status})`);
    }
    const data = res.ok ? ((await res.json().catch(() => null)) as { result?: T } | null) : null;
    return { status: res.status, data: (data?.result ?? null) as T | null };
  }

  async ensureCollection(dimensions: number): Promise<void> {
    const existing = await this.call<{ config?: { params?: { vectors?: { size?: number } } } }>("GET", this.base, undefined, [404]);
    if (existing.status === 404) {
      await this.call("PUT", this.base, { vectors: { size: dimensions, distance: "Cosine" } }, [409]);
    } else {
      const size = existing.data?.config?.params?.vectors?.size;
      if (size !== undefined && size !== dimensions) {
        throw new VectorStoreError(
          `Collection "${this.options.collection}" has ${size}-dim vectors but EMBEDDING_DIMENSIONS=${dimensions}. ` +
            "Use a new VECTOR_COLLECTION name and run the reindex script.",
        );
      }
    }
    // Payload indexes make the access filter cheap. Idempotent.
    for (const field of ["documentId", "accessLevel"]) {
      await this.call("PUT", `${this.base}/index?wait=true`, { field_name: field, field_schema: "keyword" });
    }
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    for (let i = 0; i < points.length; i += UPSERT_BATCH) {
      await this.call("PUT", `${this.base}/points?wait=true`, { points: points.slice(i, i + UPSERT_BATCH) });
    }
  }

  async search(vector: number[], filter: VectorSearchFilter, limit: number, minScore: number): Promise<VectorHit[]> {
    if (filter.documentIds.length === 0 || filter.accessLevels.length === 0) return [];
    const { data } = await this.call<{ points: { score: number; payload: SectionPayload }[] }>(
      "POST",
      `${this.base}/points/query`,
      {
        query: vector,
        limit,
        with_payload: true,
        score_threshold: minScore,
        filter: {
          must: [
            { key: "documentId", match: { any: filter.documentIds } },
            { key: "accessLevel", match: { any: filter.accessLevels } },
          ],
        },
      },
    );
    return (data?.points ?? []).map((p) => ({ score: p.score, payload: p.payload }));
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.call("POST", `${this.base}/points/delete?wait=true`, {
      filter: { must: [{ key: "documentId", match: { value: documentId } }] },
    }, [404]);
  }

  async updateDocumentPayload(
    documentId: string,
    payload: Partial<Pick<SectionPayload, "documentTitle" | "accessLevel">>,
  ): Promise<void> {
    if (Object.keys(payload).length === 0) return;
    await this.call("POST", `${this.base}/points/payload?wait=true`, {
      payload,
      filter: { must: [{ key: "documentId", match: { value: documentId } }] },
    }, [404]);
  }
}
