import { describe, expect, it } from "vitest";
import { createLogger } from "../src/config/logger.js";
import { AnthropicProvider } from "../src/modules/ai/anthropic.provider.js";
import { AIProviderError, AITimeoutError } from "../src/utils/errors.js";

const config = {
  provider: "anthropic" as const,
  apiKey: "test-key",
  model: "claude-opus-5-5",
  effort: "low" as const,
  timeoutMs: 1500,
  maxOutputTokens: 1024,
  monthlyRequestBudget: 100,
};
const input = {
  question: "How many leave days?",
  sections: [{ sectionId: "abc", documentTitle: "Handbook", sectionTitle: "Annual Leave", content: "20 days." }],
};

function message(text: string, stop_reason = "end_turn") {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: config.model,
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 30 },
  };
}

function provider(respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const requests: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    requests.push(body);
    // Like real fetch, abort when the SDK's signal fires.
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      Promise.resolve()
        .then(() => respond(body))
        .then(resolve, reject);
    });
  }) as typeof fetch;
  return { p: new AnthropicProvider(config, createLogger("silent"), { fetch: fetchImpl, maxRetries: 0 }), requests };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("AnthropicProvider", () => {
  it("sends a grounded, structured-output request and parses the answer", async () => {
    const { p, requests } = provider(() =>
      json(200, message(JSON.stringify({ found: true, answer: "20 days.", sources: [{ sectionId: "abc" }] }))),
    );
    const result = await p.generateAnswer(input);
    expect(result.answer).toEqual({ found: true, answer: "20 days.", sources: [{ sectionId: "abc" }] });
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 30 });

    const req = requests[0]!;
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.max_tokens).toBe(1024);
    expect(String(req.system)).toContain("using only the supplied company document context");
    expect(req.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
  });

  it("rejects output that does not match the schema", async () => {
    const { p } = provider(() => json(200, message(JSON.stringify({ found: "yes", answer: 3 }))));
    await expect(p.generateAnswer(input)).rejects.toBeInstanceOf(AIProviderError);
  });

  it("rejects non-JSON or empty output", async () => {
    const { p } = provider(() => json(200, message("")));
    await expect(p.generateAnswer(input)).rejects.toBeInstanceOf(AIProviderError);
  });

  it("treats truncated output as a provider error", async () => {
    const { p } = provider(() => json(200, message('{"found": true, "ans', "max_tokens")));
    await expect(p.generateAnswer(input)).rejects.toBeInstanceOf(AIProviderError);
  });

  it("maps refusals to an unsupported answer", async () => {
    const { p } = provider(() => json(200, message("", "refusal")));
    expect((await p.generateAnswer(input)).answer).toEqual({ found: false, answer: "", sources: [] });
  });

  it("maps rate limits and server errors to sanitized provider errors", async () => {
    for (const status of [429, 500, 529, 401]) {
      const { p } = provider(() => json(status, { type: "error", error: { type: "x", message: "sk-ant-secret leaked detail" } }));
      const err = await p.generateAnswer(input).catch((e) => e);
      expect(err).toBeInstanceOf(AIProviderError);
      expect(err.message).not.toContain("sk-ant");
      expect(err.status).toBe(502);
    }
  });

  it("enforces the timeout", async () => {
    const { p } = provider(() => new Promise<Response>(() => undefined)); // provider hangs
    const started = Date.now();
    await expect(p.generateAnswer(input)).rejects.toBeInstanceOf(AITimeoutError);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("maps network failures to provider errors", async () => {
    const { p } = provider(() => {
      throw new TypeError("fetch failed");
    });
    await expect(p.generateAnswer(input)).rejects.toBeInstanceOf(AIProviderError);
  });
});
