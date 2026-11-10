import { randomUUID } from "node:crypto";
import type { ChatAnswerDTO, SourceDTO } from "@ika/shared";
import type { AppConfig } from "../../config/env.js";
import type { Logger } from "../../config/logger.js";
import { ValidationError } from "../../utils/errors.js";
import { sha256 } from "../../utils/text.js";
import type { AIProvider } from "../ai/ai.types.js";
import type { SearchService } from "../search/search.service.js";
import type { UsageService } from "../usage/usage.service.js";
import type { UserRole } from "@ika/shared";
import type { UserDocument } from "../users/user.model.js";
import { noAnswer, validateCitations, type ValidatedAnswer } from "./citations.js";

interface CachedAnswer {
  answer: string;
  found: boolean;
  sources: SourceDTO[];
  requestId: string;
}

export class ChatService {
  constructor(
    private readonly config: AppConfig,
    private readonly search: SearchService,
    private readonly ai: AIProvider,
    private readonly usage: UsageService,
    private readonly logger: Logger,
  ) {}

  async ask(user: UserDocument, role: UserRole, question: string, idempotencyKey: string | undefined): Promise<ChatAnswerDTO> {
    if (question.length > this.config.limits.maxQuestionLength) {
      throw new ValidationError(`Questions must be ${this.config.limits.maxQuestionLength} characters or fewer.`);
    }
    const key = idempotencyKey ?? randomUUID().replace(/-/g, "");
    const questionHash = sha256(question.toLowerCase());

    const reservation = await this.usage.reserve(user._id, key, questionHash);
    if (reservation.kind === "replay") {
      const cached = reservation.response as CachedAnswer;
      return { ...cached, usage: await this.usage.getSummary(user._id) };
    }

    // Processing continues even if the client disconnects: the result is committed and can be
    // replayed with the same idempotency key, so a retry neither re-bills nor re-calls the AI.
    let result: ValidatedAnswer;
    try {
      result = await this.answer(user, role, question);
    } catch (err) {
      const refunded = await this.usage.release(reservation.reservationId, (err as Error).name).catch((releaseErr) => {
        this.logger.error({ err: releaseErr }, "Failed to release usage reservation");
        return false;
      });
      this.logger.warn({ userId: user._id.toString(), refunded, error: (err as Error).name }, "Chat request failed");
      throw err;
    }

    const payload: CachedAnswer = {
      answer: result.answer,
      found: result.found,
      sources: result.sources,
      requestId: key,
    };
    await this.usage.commit(reservation.reservationId, payload);
    return { ...payload, usage: await this.usage.getSummary(user._id) };
  }

  private async answer(user: UserDocument, role: UserRole, question: string): Promise<ValidatedAnswer> {
    const sections = await this.search.search(question, role);
    // Log shape, never content.
    this.logger.info({ userId: user._id.toString(), retrieved: sections.length }, "Retrieval complete");
    if (sections.length === 0) return noAnswer();

    await this.usage.consumeAiBudget();
    const { answer, usage } = await this.ai.generateAnswer({
      question,
      sections: sections.map((s) => ({
        sectionId: s.sectionId,
        documentTitle: s.documentTitle,
        sectionTitle: s.sectionTitle,
        content: s.content,
      })),
    });
    void this.usage.recordTokenUsage(usage.inputTokens, usage.outputTokens).catch(() => undefined);

    const validated = validateCitations(answer, sections);
    if (validated.invalidCitations > 0) {
      this.logger.warn(
        { userId: user._id.toString(), invalidCitations: validated.invalidCitations },
        "AI returned citations outside the retrieved context; removed",
      );
    }
    if (answer.found && !validated.found) {
      this.logger.warn({ userId: user._id.toString() }, "AI answer had no valid citations; returning no-answer");
    }
    return validated;
  }
}
