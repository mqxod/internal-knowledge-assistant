import { describe, expect, it } from "vitest";
import { OpenAIEmbedder } from "../src/modules/vector/openai.embedder.js";
import { QdrantStore, VectorStoreError } from "../src/modules/vector/qdrant.store.js";
import { pointIdForSection } from "../src/modules/vector/vector.types.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function recorder(respond: (url: string, method: string, body: any) => Response) {
  const calls: { url: string; method: string; body: any; headers: Record<string, string> }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? "GET", body, headers: init?.headers as Record<string, string> });
    return respond(url, init?.method ?? "GET", body);
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("pointIdForSection", () => {
  it("maps ObjectIds to stable UUIDs", () => {
    expect(pointIdForSection("6af22a836c39ea0b2045d218")).toBe("6af22a83-6c39-ea0b-2045-d21800000000");
  });
});

describe("QdrantStore", () => {
  const opts = { url: "http://q:6333", apiKey: "qk", collection: "sections" };

  it("creates a missing collection with cosine distance and payload indexes", async () => {
    const { f, calls } = recorder((url, method) =>
      method === "GET" ? json(404, { status: { error: "missing" } }) : json(200, { result: true }),
    );
    await new QdrantStore(opts, f).ensureCollection(1536);
    expect(calls[1]).toMatchObject({ method: "PUT", url: "http://q:6333/collections/sections", body: { vectors: { size: 1536, distance: "Cosine" } } });
    expect(calls.slice(2).map((c) => c.body.field_name)).toEqual(["documentId", "accessLevel"]);
    expect(calls[0]!.headers["api-key"]).toBe("qk");
  });

  it("refuses a collection with mismatched dimensions", async () => {
    const { f } = recorder(() => json(200, { result: { config: { params: { vectors: { size: 768 } } } } }));
    await expect(new QdrantStore(opts, f).ensureCollection(1536)).rejects.toThrow(/768-dim/);
  });

  it("searches with the document-id and access-level filter and a score floor", async () => {
    const { f, calls } = recorder(() =>
      json(200, { result: { points: [{ score: 0.8, payload: { sectionId: "s1", documentId: "d1" } }] } }),
    );
    const hits = await new QdrantStore(opts, f).search([0.1, 0.2], { documentIds: ["d1"], accessLevels: ["all"] }, 5, 0.4);
    expect(hits).toEqual([{ score: 0.8, payload: { sectionId: "s1", documentId: "d1" } }]);
    expect(calls[0]!.body).toMatchObject({
      query: [0.1, 0.2],
      limit: 5,
      score_threshold: 0.4,
      filter: { must: [{ key: "documentId", match: { any: ["d1"] } }, { key: "accessLevel", match: { any: ["all"] } }] },
    });
  });

  it("skips the call entirely when nothing is allowed", async () => {
    const { f, calls } = recorder(() => json(200, {}));
    expect(await new QdrantStore(opts, f).search([1], { documentIds: [], accessLevels: ["all"] }, 5, 0.4)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("does not leak response bodies in errors", async () => {
    const { f } = recorder(() => json(500, { status: { error: "secret payload text" } }));
    const err = await new QdrantStore(opts, f).upsert([{ id: "x", vector: [1], payload: {} as never }]).catch((e) => e);
    expect(err).toBeInstanceOf(VectorStoreError);
    expect(err.message).not.toContain("secret");
  });

  it("maps network failures to VectorStoreError", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(new QdrantStore(opts, f).deleteByDocument("d1")).rejects.toBeInstanceOf(VectorStoreError);
  });
});

describe("OpenAIEmbedder", () => {
  const config = { apiKey: "k", model: "text-embedding-3-small", dimensions: 3, timeoutMs: 2000 };

  it("requests the configured model/dimensions and returns vectors in input order", async () => {
    const { f, calls } = recorder(() =>
      json(200, {
        object: "list",
        model: config.model,
        data: [
          { object: "embedding", index: 1, embedding: [0, 1, 0] },
          { object: "embedding", index: 0, embedding: [1, 0, 0] },
        ],
        usage: { prompt_tokens: 4, total_tokens: 4 },
      }),
    );
    const out = await new OpenAIEmbedder(config, { fetch: f, maxRetries: 0 }).embed(["a", "b"]);
    expect(out).toEqual([[1, 0, 0], [0, 1, 0]]);
    expect(calls[0]!.body).toMatchObject({ model: "text-embedding-3-small", dimensions: 3, input: ["a", "b"] });
  });

  it("rejects responses with the wrong shape", async () => {
    const { f } = recorder(() =>
      json(200, { object: "list", data: [{ object: "embedding", index: 0, embedding: [1, 0] }], usage: {} }),
    );
    await expect(new OpenAIEmbedder(config, { fetch: f, maxRetries: 0 }).embed(["a"])).rejects.toThrow();
  });
});
