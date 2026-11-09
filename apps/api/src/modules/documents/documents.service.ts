import path from "node:path";
import { Types } from "mongoose";
import {
  ERROR_CODES,
  type DocumentDTO,
  type DocumentDetailDTO,
  type DocumentStatsDTO,
  type ListDocumentsQuery,
  type Paginated,
  type UpdateDocumentInput,
  type UploadDocumentFields,
} from "@ika/shared";
import type { AppConfig } from "../../config/env.js";
import type { Logger } from "../../config/logger.js";
import { withTransaction } from "../../database/transaction.js";
import { AppError, ConflictError, NotFoundError, isDuplicateKeyError } from "../../utils/errors.js";
import { escapeRegex, sha256 } from "../../utils/text.js";
import type { AuditService } from "../audit/audit.service.js";
import type { UserDocument } from "../users/user.model.js";
import { TooManySectionsError, parseDocument } from "./chunker.js";
import { DocumentModel } from "./document.model.js";
import { toDocumentDTO, toSectionDTO } from "./documents.mapper.js";
import { SectionModel } from "./section.model.js";
import { validateUpload } from "./upload.validation.js";

const UPLOADER_FIELDS = "name email";

export class DocumentsService {
  constructor(
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly logger: Logger,
  ) {}

  /**
   * Bounded synchronous ingestion. The document row is created as `processing` first so the
   * state is observable; sections and the `ready` transition are committed atomically.
   * On any failure no sections remain and the document is marked `failed` with an error code.
   */
  async upload(
    file: Express.Multer.File | undefined,
    fields: UploadDocumentFields,
    actor: UserDocument,
  ): Promise<DocumentDTO> {
    const upload = validateUpload(file, this.config.limits.maxUploadSizeBytes);
    const contentHash = sha256(upload.text);

    const existing = await DocumentModel.findOne({ contentHash }).lean();
    if (existing && existing.status !== "failed") {
      throw new ConflictError(
        ERROR_CODES.DOCUMENT_ALREADY_EXISTS,
        `This content has already been uploaded as "${existing.title}".`,
      );
    }
    if (existing) await this.removeDocumentAndSections(existing._id); // allow retrying a failed upload

    const fallbackTitle = path.basename(upload.filename, path.extname(upload.filename)).replace(/[-_]+/g, " ").trim();
    let doc;
    try {
      doc = await DocumentModel.create({
        title: fields.title ?? (fallbackTitle || "Untitled document"),
        filename: upload.filename,
        contentType: upload.contentType,
        accessLevel: fields.accessLevel,
        status: "processing",
        sizeBytes: upload.sizeBytes,
        contentHash,
        uploadedBy: actor._id,
        processingStartedAt: new Date(),
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError(ERROR_CODES.DOCUMENT_ALREADY_EXISTS, "This content has already been uploaded.");
      }
      throw err;
    }

    try {
      const parsed = parseDocument(upload.text, upload.contentType, doc.title, {
        maxChunkChars: this.config.limits.maxChunkChars,
        maxSections: this.config.limits.maxSectionsPerDocument,
      });
      if (parsed.sections.length === 0) {
        throw new AppError(422, ERROR_CODES.EMPTY_DOCUMENT, "No indexable sections were found in the document.");
      }
      const title = fields.title ?? parsed.detectedTitle ?? doc.title;

      await withTransaction(async (session) => {
        await SectionModel.insertMany(
          parsed.sections.map((s, i) => ({
            documentId: doc._id,
            documentTitle: title,
            sectionTitle: s.sectionTitle,
            parentHeading: s.parentHeading,
            headingPath: s.headingPath,
            content: s.content,
            sectionIndex: i,
            charCount: s.content.length,
          })),
          { session },
        );
        const updated = await DocumentModel.updateOne(
          { _id: doc._id, status: "processing" },
          { $set: { status: "ready", title, sectionCount: parsed.sections.length, processedAt: new Date(), errorCode: null } },
          { session },
        );
        if (updated.modifiedCount !== 1) throw new Error("Document left processing state during ingestion");
        await this.audit.record(
          {
            actorId: actor._id,
            action: "document.upload",
            resourceType: "document",
            resourceId: doc._id,
            metadata: { title, accessLevel: fields.accessLevel, sections: parsed.sections.length },
          },
          session,
        );
      });
      this.logger.info({ documentId: doc._id.toString(), sections: parsed.sections.length }, "Document ingested");
      return this.getSummary(doc._id);
    } catch (err) {
      const { code, message, status } = describeIngestionFailure(err, this.config.limits.maxSectionsPerDocument);
      this.logger.warn({ documentId: doc._id.toString(), code, err: err instanceof AppError ? undefined : err }, "Document ingestion failed");
      await this.markFailed(doc._id, code);
      await this.audit
        .record({ actorId: actor._id, action: "document.upload_failed", resourceType: "document", resourceId: doc._id, metadata: { code } })
        .catch(() => undefined);
      throw new AppError(status, code as never, message, { documentId: doc._id.toString() });
    }
  }

  private async markFailed(id: Types.ObjectId, errorCode: string): Promise<void> {
    await SectionModel.deleteMany({ documentId: id });
    await DocumentModel.updateOne({ _id: id }, { $set: { status: "failed", errorCode, sectionCount: 0, processedAt: new Date() } });
  }

  private async removeDocumentAndSections(id: Types.ObjectId): Promise<void> {
    await withTransaction(async (session) => {
      await SectionModel.deleteMany({ documentId: id }, { session });
      await DocumentModel.deleteOne({ _id: id }, { session });
    });
  }

  /** Marks documents stuck in `processing` (e.g. the server restarted mid-ingestion) as failed. */
  async recoverStaleProcessing(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const stale = await DocumentModel.find({ status: "processing", processingStartedAt: { $lt: cutoff } }, { _id: 1 }).lean();
    for (const d of stale) await this.markFailed(d._id, "PROCESSING_INTERRUPTED");
    if (stale.length) this.logger.warn({ count: stale.length }, "Recovered interrupted document ingestions");
    return stale.length;
  }

  async list(query: ListDocumentsQuery): Promise<Paginated<DocumentDTO>> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.accessLevel) filter.accessLevel = query.accessLevel;
    if (query.search) {
      const rx = { $regex: escapeRegex(query.search), $options: "i" };
      filter.$or = [{ title: rx }, { filename: rx }];
    }
    const [items, total] = await Promise.all([
      DocumentModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .populate("uploadedBy", UPLOADER_FIELDS)
        .lean(),
      DocumentModel.countDocuments(filter),
    ]);
    return {
      items: items.map((d) => toDocumentDTO(d as never)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async stats(): Promise<DocumentStatsDTO> {
    const [counts, adminOnly, recent] = await Promise.all([
      DocumentModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
      DocumentModel.countDocuments({ accessLevel: "admin-only" }),
      DocumentModel.find().sort({ createdAt: -1 }).limit(5).populate("uploadedBy", UPLOADER_FIELDS).lean(),
    ]);
    const by = Object.fromEntries(counts.map((c) => [c._id, c.n])) as Record<string, number>;
    return {
      total: counts.reduce((a, c) => a + c.n, 0),
      ready: by.ready ?? 0,
      processing: by.processing ?? 0,
      failed: by.failed ?? 0,
      adminOnly,
      recent: recent.map((d) => toDocumentDTO(d as never)),
    };
  }

  private async getSummary(id: Types.ObjectId | string): Promise<DocumentDTO> {
    const doc = await DocumentModel.findById(id).populate("uploadedBy", UPLOADER_FIELDS).lean();
    if (!doc) throw new NotFoundError(ERROR_CODES.DOCUMENT_NOT_FOUND, "Document not found.");
    return toDocumentDTO(doc as never);
  }

  async getDetail(id: string): Promise<DocumentDetailDTO> {
    const summary = await this.getSummary(id);
    const sections = await SectionModel.find({ documentId: new Types.ObjectId(id) }).sort({ sectionIndex: 1 }).lean();
    return { ...summary, sections: sections.map(toSectionDTO) };
  }

  async update(id: string, input: UpdateDocumentInput, actor: UserDocument): Promise<DocumentDTO> {
    await withTransaction(async (session) => {
      const doc = await DocumentModel.findById(id).session(session);
      if (!doc) throw new NotFoundError(ERROR_CODES.DOCUMENT_NOT_FOUND, "Document not found.");
      if (doc.status === "processing") {
        throw new ConflictError(ERROR_CODES.DOCUMENT_PROCESSING, "This document is still being processed.");
      }
      const changes: Record<string, string> = {};
      if (input.title !== undefined && input.title !== doc.title) {
        changes.title = input.title;
        doc.title = input.title;
        await SectionModel.updateMany({ documentId: doc._id }, { $set: { documentTitle: input.title } }, { session });
      }
      if (input.accessLevel !== undefined && input.accessLevel !== doc.accessLevel) {
        changes.accessLevel = input.accessLevel;
        doc.accessLevel = input.accessLevel;
      }
      if (Object.keys(changes).length === 0) return;
      await doc.save({ session });
      await this.audit.record(
        { actorId: actor._id, action: "document.update", resourceType: "document", resourceId: doc._id, metadata: changes },
        session,
      );
    });
    return this.getSummary(id);
  }

  async delete(id: string, actor: UserDocument): Promise<void> {
    await withTransaction(async (session) => {
      const doc = await DocumentModel.findById(id).session(session);
      if (!doc) throw new NotFoundError(ERROR_CODES.DOCUMENT_NOT_FOUND, "Document not found.");
      if (doc.status === "processing") {
        throw new ConflictError(ERROR_CODES.DOCUMENT_PROCESSING, "This document is still being processed.");
      }
      await SectionModel.deleteMany({ documentId: doc._id }, { session });
      await DocumentModel.deleteOne({ _id: doc._id }, { session });
      await this.audit.record(
        { actorId: actor._id, action: "document.delete", resourceType: "document", resourceId: doc._id, metadata: { title: doc.title } },
        session,
      );
    });
  }
}

function describeIngestionFailure(err: unknown, maxSections: number): { code: string; message: string; status: number } {
  if (err instanceof TooManySectionsError) {
    return {
      code: ERROR_CODES.TOO_MANY_SECTIONS,
      message: `The document is too large to index (more than ${maxSections} sections). Split it into smaller documents.`,
      status: 422,
    };
  }
  if (err instanceof AppError) return { code: err.code, message: err.message, status: err.status };
  return { code: "PROCESSING_ERROR", message: "The document could not be processed. Please try again.", status: 500 };
}
