import type { Types } from "mongoose";
import type { DocumentDTO, SectionDTO } from "@ika/shared";
import type { KnowledgeDocument } from "./document.model.js";
import type { Section } from "./section.model.js";

type Uploader = { _id: Types.ObjectId; name: string; email: string } | null;
type DocLike = Omit<KnowledgeDocument, "uploadedBy"> & {
  _id: Types.ObjectId;
  uploadedBy: Types.ObjectId | Uploader;
  createdAt: Date;
  updatedAt: Date;
};

function isPopulated(u: DocLike["uploadedBy"]): u is NonNullable<Uploader> {
  return !!u && typeof u === "object" && "email" in u;
}

export function toDocumentDTO(d: DocLike): DocumentDTO {
  return {
    id: d._id.toString(),
    title: d.title,
    filename: d.filename,
    contentType: d.contentType,
    accessLevel: d.accessLevel,
    status: d.status,
    sectionCount: d.sectionCount,
    sizeBytes: d.sizeBytes,
    errorCode: d.errorCode ?? null,
    uploadedBy: isPopulated(d.uploadedBy)
      ? { id: d.uploadedBy._id.toString(), name: d.uploadedBy.name, email: d.uploadedBy.email }
      : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function toSectionDTO(s: Section & { _id: Types.ObjectId }): SectionDTO {
  return {
    id: s._id.toString(),
    sectionTitle: s.sectionTitle,
    parentHeading: s.parentHeading ?? null,
    headingPath: s.headingPath ?? [],
    sectionIndex: s.sectionIndex,
    content: s.content,
    charCount: s.charCount,
  };
}
