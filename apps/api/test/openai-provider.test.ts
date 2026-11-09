import { describe, expect, it } from "vitest";
import { createLogger } from "../src/config/logger.js";
import { OpenAIProvider } from "../src/modules/ai/openai.provider.js";
import { AIProviderError, AITimeoutError } from "../src/utils/errors.js";

const config = {
  provider: "openai" as const,
  apiKey: "test-key",
  model: "gpt-5.4-mini",
  effort: "low" as const,
  timeoutMs: 1500,
  maxOutputTokens: 1024,
  monthlyRequestBudget: 100,
};
const input = {
  question: "How many leave days?",
  sections: [{ sectionId: "abc", documentTitle: "Handbook", sectionTitle: "Annual Leave", content: "20 days." }],
};

function completion(content: string | null, finish_reason = "stop", refusal: string | null = null) {
  return {
    id: "chatcmpl_1",
    object: "chat.completion",
    created: 0,
    model: config.model,
    choices: [{ index: 0, finish_reason, message: { role: "assistant", content, refusal } }],
    usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
  };
}

function provider(respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const requests: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    requests.push(body);
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      Promise.resolve()
        .then(() => respond(body))
        .then(resolve, reject);
    });
  }) as typeof fetch;
  return { p: new OpenAIProvider(config, createLogger("silent"), { fetch: fetchImpl, maxRetries: 0 }), requests };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("OpenAIProvider", () => {
  it("sends a grounded, strict structured-output request and parses the answer", async () => {
    const { p, requests } = provider(() =>
      json(200, completion(JSON.stringify({ found: true, answer: "20 days.", sources: [{ sectionId: "abc" }] }))),
    );
    const result = await p.generateAnswer(input);
    expect(result.answer).toEqual({ found: true, answer: "20 days.", sources: [{ sectionId: "abc" }] });
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 30 });

    const req = requests[0]! as { messages: { role: string; content: string }[] } & Record<string, unknown>;
    expect(req.model).toBe("gpt-5.4-mini");
    expect(req.max_completion_tokens).toBe(1024);
    expect(req.reasoning_effort).toBe("low");
    expect(req.messages[0]!.role).toBe("developer");
    expect(req.messages[0]!.content).toContain("using only the supplied company document context");
    expect(req.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
  });

  it("rejects output that does not match the schema", async () => {
    const { p } = provider(() => json(200, completion(JSON.stringify({ found: "yes", answer: 3 }))));
    await expect(p.generateAnswer(input)).rejects.toBeInstanceOf(AIProviderError);
  });

  it("rejects non-JSON or empty output", async () => {
    for (const content of ["", "not json", null]) {
      const { p } = provider(() => json(200, completion(content)));
      await expect(p.generateAnswer(input)).rejects.toBeInstanceOf(AIProviderError);
    }
  });

  it("treats truncated output as a provider error", async () => {
    const { p } = provider(() => json(200, completion('{"found": true, "ans', "length")));
    await expect(p.generateAnswer(input)).rejects.toBeInstanceOf(AIProviderError);
  });

  it("maps refusals to an unsupported answer", async () => {
    const { p } = provider(() => json(200, completion(null, "stop", "I can't help with that.")));
    expect((await p.generateAnswer(input)).answer).toEqual({ found: false, answer: "", sources: [] });
  });

  it("maps rate limits, auth and server errors to sanitized provider errors", async () => {
    for (const status of [429, 500, 503, 401]) {
      const { p } = provider(() => json(status, { error: { type: "x", message: "sk-proj-secret leaked detail" } }));
      const err = await p.generateAnswer(input).catch((e) => e);
      expect(err).toBeInstanceOf(AIProviderError);
      expect(err.message).not.toContain("sk-proj");
      expect(err.status).toBe(502);
    }
  });

  it("enforces the timeout", async () => {
    const { p } = provider(() => new Promise<Response>(() => undefined));
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
