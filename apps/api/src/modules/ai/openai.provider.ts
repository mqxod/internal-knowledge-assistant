import OpenAI from "openai";
import type { AppConfig } from "../../config/env.js";
import type { Logger } from "../../config/logger.js";
import { AIProviderError, AITimeoutError } from "../../utils/errors.js";
import { aiAnswerSchema, type AIContextSection, type AIProvider, type AIResult } from "./ai.types.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt.js";

/** Strict JSON schema mirroring `aiAnswerSchema` (OpenAI strict mode: all keys required, no extras). */
const ANSWER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "answer", "sources"],
  properties: {
    found: { type: "boolean", description: "true only if the supplied context fully supports the answer" },
    answer: { type: "string", description: "Concise answer in Markdown, or an empty string when found=false" },
    sources: {
      type: "array",
      description: "Sections that directly support the answer",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sectionId"],
        properties: { sectionId: { type: "string", description: "An id copied exactly from the supplied context" } },
      },
    },
  },
} as const;

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor(
    private readonly config: AppConfig["ai"],
    private readonly logger: Logger,
    clientOptions: { fetch?: typeof fetch; maxRetries?: number } = {},
  ) {
    // One SDK-level retry for transient 429/5xx; the overall deadline below caps total wall time.
    this.client = new OpenAI({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 1, ...clientOptions });
  }

  async generateAnswer(input: { question: string; sections: AIContextSection[] }): Promise<AIResult> {
    const deadline = AbortSignal.timeout(this.config.timeoutMs);
    const started = Date.now();
    let response;
    try {
      response = await this.client.chat.completions.create(
        {
          model: this.config.model,
          max_completion_tokens: this.config.maxOutputTokens,
          messages: [
            { role: "developer", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserMessage(input.question, input.sections) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "grounded_answer", strict: true, schema: ANSWER_JSON_SCHEMA },
          },
          ...(this.config.effort ? { reasoning_effort: this.config.effort } : {}),
        },
        { signal: deadline },
      );
    } catch (err) {
      throw this.mapError(err, deadline.aborted);
    }

    const usage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
    const choice = response.choices[0];
    this.logger.info(
      { ai: { model: this.config.model, ms: Date.now() - started, stop: choice?.finish_reason, ...usage } },
      "AI answer generated",
    );
    if (!choice) throw new AIProviderError(undefined, "empty_output");

    if (choice.message.refusal || choice.finish_reason === "content_filter") {
      // A safety refusal is treated as "not answerable from the documents".
      return { answer: { found: false, answer: "", sources: [] }, usage };
    }
    if (choice.finish_reason === "length") {
      throw new AIProviderError(undefined, "truncated_output");
    }
    const text = (choice.message.content ?? "").trim();
    if (!text) throw new AIProviderError(undefined, "empty_output");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AIProviderError(undefined, "invalid_structured_output");
    }
    const parsed = aiAnswerSchema.safeParse(json);
    if (!parsed.success) throw new AIProviderError(undefined, "invalid_structured_output");
    return { answer: parsed.data, usage };
  }

  private mapError(err: unknown, deadlineHit: boolean): Error {
    if (err instanceof OpenAI.APIConnectionTimeoutError || (deadlineHit && err instanceof OpenAI.APIUserAbortError)) {
      this.logger.warn({ ai: { error: "timeout" } }, "AI provider timeout");
      return new AITimeoutError();
    }
    // Log only status/type; provider messages can echo request content.
    if (err instanceof OpenAI.RateLimitError) {
      this.logger.warn({ ai: { error: "rate_limited", status: 429 } }, "AI provider rate limited");
      return new AIProviderError("The AI service is busy right now. Please try again in a minute.", "rate_limited");
    }
    if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
      this.logger.error({ ai: { error: "auth", status: err.status } }, "AI provider rejected credentials");
      return new AIProviderError(undefined, "auth");
    }
    if (err instanceof OpenAI.APIError) {
      this.logger.error({ ai: { error: "api_error", status: err.status, type: err.name } }, "AI provider error");
      return new AIProviderError(undefined, "api_error");
    }
    this.logger.error({ ai: { error: "unknown", type: (err as Error)?.name } }, "AI provider call failed");
    return new AIProviderError(undefined, "network");
  }
}
