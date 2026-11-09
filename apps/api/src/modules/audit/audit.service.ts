import type { ClientSession, Types } from "mongoose";
import type { AuditLogDTO } from "@ika/shared";
import type { Logger } from "../../config/logger.js";
import { AuditLogModel, type AuditAction } from "./audit.model.js";

export interface AuditEntry {
  actorId: Types.ObjectId | null;
  action: AuditAction;
  resourceType: "document" | "user";
  resourceId: Types.ObjectId | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export class AuditService {
  constructor(private readonly logger: Logger) {}

  async record(entry: AuditEntry, session?: ClientSession): Promise<void> {
    await AuditLogModel.create([{ ...entry, metadata: entry.metadata ?? {} }], { session });
    this.logger.info(
      { audit: { action: entry.action, actorId: entry.actorId?.toString(), resourceId: entry.resourceId?.toString() } },
      "Audit event",
    );
  }

  async listRecent(limit: number): Promise<AuditLogDTO[]> {
    const rows = await AuditLogModel.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate<{ actorId: { _id: Types.ObjectId; name: string; email: string } | null }>("actorId", "name email")
      .lean();
    return rows.map((r) => ({
      id: r._id.toString(),
      action: r.action,
      actor: r.actorId ? { id: r.actorId._id.toString(), name: r.actorId.name, email: r.actorId.email } : null,
      resourceType: r.resourceType,
      resourceId: r.resourceId?.toString() ?? null,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
