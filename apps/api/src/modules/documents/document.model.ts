import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { ACCESS_LEVELS, CONTENT_TYPES, DOCUMENT_STATUSES } from "@ika/shared";

const documentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    filename: { type: String, required: true, maxlength: 255 },
    contentType: { type: String, enum: CONTENT_TYPES, required: true },
    accessLevel: { type: String, enum: ACCESS_LEVELS, required: true, default: "all" },
    status: { type: String, enum: DOCUMENT_STATUSES, required: true, default: "processing" },
    sectionCount: { type: Number, required: true, default: 0, min: 0 },
    sizeBytes: { type: Number, required: true, min: 0 },
    /** SHA-256 of the normalised content, used for duplicate detection. */
    contentHash: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    errorCode: { type: String, default: null },
    processingStartedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    /** Set once the sections are embedded in the vector DB; null = keyword-only until backfilled. */
    vectorIndexedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "documents" },
);

documentSchema.index({ contentHash: 1 }, { unique: true, name: "uniq_content_hash" });
documentSchema.index({ status: 1, accessLevel: 1 }, { name: "status_access" });
documentSchema.index({ createdAt: -1 }, { name: "created_desc" });

export type KnowledgeDocument = InferSchemaType<typeof documentSchema>;
export type KnowledgeDocumentDoc = HydratedDocument<KnowledgeDocument>;
export const DocumentModel = model("Document", documentSchema);
