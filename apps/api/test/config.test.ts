import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

const base = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://x",
  CLERK_SECRET_KEY: "sk_test_x",
  FRONTEND_URL: "http://localhost:3000",
};

describe("AI provider configuration", () => {
  it("detects Groq from a gsk_ key and uses its OpenAI-compatible endpoint and default model", () => {
    const c = loadConfig({ ...base, AI_API_KEY: "gsk_abc" });
    expect(c.ai).toMatchObject({ provider: "groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" });
  });

  it("detects Anthropic and OpenAI keys", () => {
    expect(loadConfig({ ...base, AI_API_KEY: "sk-ant-x" }).ai).toMatchObject({ provider: "anthropic", baseUrl: undefined });
    expect(loadConfig({ ...base, AI_API_KEY: "sk-proj-x" }).ai).toMatchObject({ provider: "openai", baseUrl: undefined });
  });

  it("honours explicit provider, model and base URL", () => {
    const c = loadConfig({ ...base, AI_API_KEY: "k", AI_PROVIDER: "groq", AI_MODEL: "llama-x", AI_BASE_URL: "https://proxy.example/v1/" });
    expect(c.ai).toMatchObject({ provider: "groq", model: "llama-x", baseUrl: "https://proxy.example/v1" });
  });

  it("rejects unknown providers with a clear message", () => {
    expect(() => loadConfig({ ...base, AI_API_KEY: "k", AI_PROVIDER: "grok-ai" })).toThrow(/AI_PROVIDER/);
  });
});

describe("vector search configuration", () => {
  it("is off without a vector DB URL (keyword-only)", () => {
    expect(loadConfig({ ...base, AI_API_KEY: "gsk_x" }).vector).toBeNull();
  });

  it("is off with Groq and no embeddings key (Groq has no embeddings API)", () => {
    expect(loadConfig({ ...base, AI_API_KEY: "gsk_x", VECTOR_DB_URL: "http://qdrant:6333" }).vector).toBeNull();
  });

  it("accepts a keyless OpenAI-compatible embeddings endpoint", () => {
    const v = loadConfig({
      ...base,
      AI_API_KEY: "gsk_x",
      VECTOR_DB_URL: "http://qdrant:6333",
      EMBEDDING_BASE_URL: "http://ollama:11434/v1",
      EMBEDDING_DIMENSIONS: "768",
    }).vector;
    expect(v?.embedding).toMatchObject({ baseUrl: "http://ollama:11434/v1", dimensions: 768 });
  });
});
