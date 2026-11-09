import { Schema, model, type InferSchemaType } from "mongoose";

export const RESERVATION_STATUSES = ["reserved", "committed", "released"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/**
 * One row per chat request (keyed by the client's idempotency key).
 * - reserved:  a usage slot is held while the request is processed
 * - committed: the request completed; the slot is consumed and the response cached for replay
 * - released:  the request failed for a system reason; the slot was refunded exactly once
 */
const reservationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String, required: true },
    questionHash: { type: String, required: true },
    month: { type: String, required: true },
    status: { type: String, enum: RESERVATION_STATUSES, required: true, default: "reserved" },
    /** Cached result for idempotent replays (answer + validated sources only). */
    response: { type: Schema.Types.Mixed, default: null },
    releaseReason: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "usage_reservations" },
);

reservationSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, name: "uniq_user_key" });
reservationSchema.index({ status: 1, createdAt: 1 }, { name: "status_created" });
reservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expires" });

export type Reservation = InferSchemaType<typeof reservationSchema>;
export const ReservationModel = model("UsageReservation", reservationSchema);
