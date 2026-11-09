import { Schema, model, type InferSchemaType } from "mongoose";

/** Authoritative per-user monthly counter (includes in-flight reservations). */
const usageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    requestCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true }, collection: "usage" },
);
usageSchema.index({ userId: 1, month: 1 }, { unique: true, name: "uniq_user_month" });

export type Usage = InferSchemaType<typeof usageSchema>;
export const UsageModel = model("Usage", usageSchema);
