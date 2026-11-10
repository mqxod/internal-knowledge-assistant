import OpenAI from "openai";
import type { AppConfig } from "../../config/env.js";
import type { Embedder } from "./vector.types.js";

type EmbeddingConfig = NonNullable<AppConfig["vector"]>["embedding"];

/** OpenAI's API accepts up to 2048 inputs per request; stay well under it. */
const BATCH_SIZE = 256;

export class OpenAIEmbedder implements Embedder {
  readonly dimensions: number;
  private readonly client: OpenAI;

  constructor(
    private readonly config: EmbeddingConfig,
    clientOptions: { fetch?: typeof fetch; maxRetries?: number } = {},
  ) {
    this.dimensions = config.dimensions;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      timeout: config.timeoutMs,
      maxRetries: 1,
      ...clientOptions,
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const res = await this.client.embeddings.create({
        model: this.config.model,
        input: batch,
        // Only OpenAI's own API supports shortening vectors; other servers return the model's native size.
        ...(this.config.baseUrl ? {} : { dimensions: this.config.dimensions }),
        encoding_format: "float",
      });
      const vectors = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
      if (vectors.length !== batch.length || vectors.some((v) => v.length !== this.dimensions)) {
        throw new Error("Embedding response did not match the request");
      }
      out.push(...vectors);
    }
    return out;
  }
}
