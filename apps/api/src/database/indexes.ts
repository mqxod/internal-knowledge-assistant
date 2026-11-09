import { AuditLogModel } from "../modules/audit/audit.model.js";
import { DocumentModel } from "../modules/documents/document.model.js";
import { SectionModel } from "../modules/documents/section.model.js";
import { ReservationModel } from "../modules/usage/reservation.model.js";
import { SystemUsageModel } from "../modules/usage/system-usage.model.js";
import { UsageModel } from "../modules/usage/usage.model.js";
import { UserModel } from "../modules/users/user.model.js";

export const ALL_MODELS = [
  UserModel,
  DocumentModel,
  SectionModel,
  UsageModel,
  ReservationModel,
  SystemUsageModel,
  AuditLogModel,
] as const;

/** Creates collections (required before use inside transactions) and syncs declared indexes. */
export async function ensureIndexes(): Promise<void> {
  for (const m of ALL_MODELS) {
    await m.createCollection().catch(() => undefined);
    await m.syncIndexes();
  }
}
