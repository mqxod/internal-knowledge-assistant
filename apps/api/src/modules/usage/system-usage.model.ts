import { Schema, model } from "mongoose";

/** Organisation-wide AI call counter: a provider-spend guardrail independent of per-user quotas. */
const systemUsageSchema = new Schema(
  {
    month: { type: String, required: true },
    aiRequestCount: { type: Number, required: true, default: 0, min: 0 },
    inputTokens: { type: Number, required: true, default: 0 },
    outputTokens: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: "system_usage" },
);
systemUsageSchema.index({ month: 1 }, { unique: true, name: "uniq_month" });

export const SystemUsageModel = model("SystemUsage", systemUsageSchema);
