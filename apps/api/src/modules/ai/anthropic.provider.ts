import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AppConfig } from "../../config/env.js";
import type { Logger } from "../../config/logger.js";
import { AIProviderError, AITimeoutError } from "../../utils/errors.js";
import { aiAnswerSchema, type AIContextSection, type AIProvider, type AIResult } from "./ai.types.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt.js";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    private readonly config: AppConfig["ai"],
    private readonly logger: Logger,
    clientOptions: { fetch?: typeof fetch; maxRetries?: number } = {},
  ) {
    // One SDK-level retry for transient 429/5xx; the overall deadline below caps total wall time.
    this.client = new Anthropic({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 1, ...clientOptions });
  }

  async generateAnswer(input: { question: string; sections: AIContextSection[] }): Promise<AIResult> {
    const deadline = AbortSignal.timeout(this.config.timeoutMs);
    const started = Date.now();
    let response;
    try {
      response = await this.client.messages.create(
        {
          model: this.config.model,
          max_tokens: this.config.maxOutputTokens,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserMessage(input.question, input.sections) }],
          output_config: {
            format: zodOutputFormat(aiAnswerSchema),
            ...(this.config.effort ? { effort: this.config.effort } : {}),
          },
        },
        { signal: deadline },
      );
    } catch (err) {
      throw this.mapError(err, deadline.aborted);
    }

    const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    this.logger.info(
      { ai: { model: this.config.model, ms: Date.now() - started, stop: response.stop_reason, ...usage } },
      "AI answer generated",
    );

    if (response.stop_reason === "refusal") {
      // A safety refusal is treated as "not answerable from the documents".
      return { answer: { found: false, answer: "", sources: [] }, usage };
    }
    if (response.stop_reason === "max_tokens") {
      throw new AIProviderError(undefined, "truncated_output");
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
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
    if (err instanceof Anthropic.APIConnectionTimeoutError || (deadlineHit && err instanceof Anthropic.APIUserAbortError)) {
      this.logger.warn({ ai: { error: "timeout" } }, "AI provider timeout");
      return new AITimeoutError();
    }
    // Log only status/type; provider messages can echo request content.
    if (err instanceof Anthropic.RateLimitError) {
      this.logger.warn({ ai: { error: "rate_limited", status: 429 } }, "AI provider rate limited");
      return new AIProviderError("The AI service is busy right now. Please try again in a minute.", "rate_limited");
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      this.logger.error({ ai: { error: "auth", status: err.status } }, "AI provider rejected credentials");
      return new AIProviderError(undefined, "auth");
    }
    if (err instanceof Anthropic.APIError) {
      this.logger.error({ ai: { error: "api_error", status: err.status, type: err.name } }, "AI provider error");
      return new AIProviderError(undefined, "api_error");
    }
    this.logger.error({ ai: { error: "unknown", type: (err as Error)?.name } }, "AI provider call failed");
    return new AIProviderError(undefined, "network");
  }
}
