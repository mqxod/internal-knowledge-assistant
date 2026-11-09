import { Types } from "mongoose";
import { ERROR_CODES, type UsageSummary } from "@ika/shared";
import type { Logger } from "../../config/logger.js";
import { withTransaction } from "../../database/transaction.js";
import { AppError, ConflictError, MonthlyLimitError, isDuplicateKeyError } from "../../utils/errors.js";
import { monthKey, nextMonthStart } from "../../utils/month.js";
import { ReservationModel } from "./reservation.model.js";
import { SystemUsageModel } from "./system-usage.model.js";
import { UsageModel } from "./usage.model.js";

export interface UsageServiceOptions {
  monthlyLimit: number;
  aiMonthlyBudget: number;
  /** How long a committed response can be replayed for the same idempotency key. */
  replayWindowMs: number;
  /** Reservations older than this that never completed are considered abandoned. */
  staleReservationMs: number;
}

export type ReserveResult =
  | { kind: "reserved"; reservationId: Types.ObjectId }
  | { kind: "replay"; response: unknown };

/**
 * Quota policy
 * - A slot is reserved atomically *before* any retrieval or AI work, so concurrent requests can
 *   never exceed the limit (the conditional `$lt` increment is the gate).
 * - Completed requests are committed and count against the quota, including "no answer" results.
 * - Requests that fail for system reasons (AI timeout/error, internal error) are released and the
 *   slot is refunded. The reserved→released transition is conditional, so a refund happens once.
 * - Retries with the same idempotency key replay the committed result and are not counted again.
 */
export class UsageService {
  constructor(
    private readonly options: UsageServiceOptions,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get limit(): number {
    return this.options.monthlyLimit;
  }

  summarize(used: number, at: Date = this.now()): UsageSummary {
    const limit = this.options.monthlyLimit;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetsAt: nextMonthStart(at).toISOString(),
      month: monthKey(at),
    };
  }

  async getSummary(userId: Types.ObjectId): Promise<UsageSummary> {
    const at = this.now();
    const doc = await UsageModel.findOne({ userId, month: monthKey(at) }).lean();
    return this.summarize(doc?.requestCount ?? 0, at);
  }

  private async ensureCounter(userId: Types.ObjectId, month: string): Promise<void> {
    try {
      await UsageModel.updateOne({ userId, month }, { $setOnInsert: { requestCount: 0 } }, { upsert: true });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err; // a concurrent request created it first
    }
  }

  async reserve(userId: Types.ObjectId, idempotencyKey: string, questionHash: string): Promise<ReserveResult> {
    const at = this.now();
    const month = monthKey(at);
    await this.ensureCounter(userId, month);

    try {
      return await withTransaction<ReserveResult>(async (session) => {
        const existing = await ReservationModel.findOne({ userId, idempotencyKey }).session(session);
        if (existing) {
          if (existing.questionHash !== questionHash) {
            throw new AppError(422, ERROR_CODES.IDEMPOTENCY_KEY_REUSED, "This request key was already used for a different question.");
          }
          if (existing.status === "committed") return { kind: "replay", response: existing.response };
          if (existing.status === "reserved") {
            throw new ConflictError(ERROR_CODES.REQUEST_IN_PROGRESS, "This question is already being answered.");
          }
        }

        const inc = await UsageModel.updateOne(
          { userId, month, requestCount: { $lt: this.options.monthlyLimit } },
          { $inc: { requestCount: 1 } },
          { session },
        );
        if (inc.modifiedCount !== 1) throw new LimitSignal();

        const expiresAt = new Date(at.getTime() + this.options.replayWindowMs);
        if (existing) {
          // A previously released (failed) request is being retried with the same key.
          existing.set({ status: "reserved", month, releaseReason: null, response: null, expiresAt });
          await existing.save({ session });
          return { kind: "reserved", reservationId: existing._id };
        }
        const [created] = await ReservationModel.create(
          [{ userId, idempotencyKey, questionHash, month, status: "reserved", expiresAt }],
          { session },
        );
        return { kind: "reserved", reservationId: created!._id };
      });
    } catch (err) {
      if (err instanceof LimitSignal) throw new MonthlyLimitError(await this.getSummary(userId));
      if (isDuplicateKeyError(err)) {
        throw new ConflictError(ERROR_CODES.REQUEST_IN_PROGRESS, "This question is already being answered.");
      }
      throw err;
    }
  }

  /** Marks a reservation as consumed and caches the response for idempotent replay. */
  async commit(reservationId: Types.ObjectId, response: unknown): Promise<void> {
    const res = await ReservationModel.updateOne(
      { _id: reservationId, status: "reserved" },
      { $set: { status: "committed", response } },
    );
    if (res.modifiedCount !== 1) {
      this.logger.warn({ reservationId: reservationId.toString() }, "Reservation was not in reserved state at commit");
    }
  }

  /** Refunds the slot exactly once. Safe to call multiple times or concurrently. */
  async release(reservationId: Types.ObjectId, reason: string): Promise<boolean> {
    return withTransaction(async (session) => {
      const reservation = await ReservationModel.findOneAndUpdate(
        { _id: reservationId, status: "reserved" },
        { $set: { status: "released", releaseReason: reason } },
        { session, returnDocument: "after" },
      );
      if (!reservation) return false;
      await UsageModel.updateOne(
        { userId: reservation.userId, month: reservation.month, requestCount: { $gt: 0 } },
        { $inc: { requestCount: -1 } },
        { session },
      );
      return true;
    });
  }

  /** Releases reservations abandoned by a crashed or killed process. */
  async releaseStaleReservations(): Promise<number> {
    const cutoff = new Date(this.now().getTime() - this.options.staleReservationMs);
    const stale = await ReservationModel.find({ status: "reserved", createdAt: { $lt: cutoff } }, { _id: 1 }).limit(500).lean();
    let released = 0;
    for (const r of stale) if (await this.release(r._id, "abandoned")) released++;
    if (released) this.logger.warn({ released }, "Released abandoned usage reservations");
    return released;
  }

  /**
   * Organisation-wide guardrail on provider calls. Counted only when the AI is actually called
   * and never refunded, because the provider bills attempted calls.
   */
  async consumeAiBudget(): Promise<void> {
    const month = monthKey(this.now());
    try {
      await SystemUsageModel.updateOne({ month }, { $setOnInsert: { aiRequestCount: 0 } }, { upsert: true });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
    const res = await SystemUsageModel.updateOne(
      { month, aiRequestCount: { $lt: this.options.aiMonthlyBudget } },
      { $inc: { aiRequestCount: 1 } },
    );
    if (res.modifiedCount !== 1) {
      this.logger.error({ month }, "Organisation AI budget exhausted");
      throw new AppError(503, ERROR_CODES.AI_PROVIDER_ERROR, "The assistant has reached its organisation-wide monthly capacity. Please contact your administrator.");
    }
  }

  async recordTokenUsage(inputTokens: number, outputTokens: number): Promise<void> {
    await SystemUsageModel.updateOne({ month: monthKey(this.now()) }, { $inc: { inputTokens, outputTokens } });
  }
}

class LimitSignal extends Error {}
