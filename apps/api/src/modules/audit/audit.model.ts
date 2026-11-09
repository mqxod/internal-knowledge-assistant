import { Schema, model, type InferSchemaType } from "mongoose";

export const AUDIT_ACTIONS = [
  "document.upload",
  "document.upload_failed",
  "document.update",
  "document.delete",
  "user.create",
  "user.role_change",
  "user.status_change",
  "user.bootstrap_admin",
  "user.linked",
  "user.self_provisioned",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    resourceType: { type: String, enum: ["document", "user"], required: true },
    resourceId: { type: Schema.Types.ObjectId, default: null },
    /** Small, non-sensitive facts only (titles, levels). Never document content or tokens. */
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "audit_logs" },
);
auditLogSchema.index({ createdAt: -1 }, { name: "created_desc" });
auditLogSchema.index({ resourceId: 1, createdAt: -1 }, { name: "resource_created" });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model("AuditLog", auditLogSchema);
