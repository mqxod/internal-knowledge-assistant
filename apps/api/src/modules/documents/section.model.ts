import { Schema, model, type InferSchemaType } from "mongoose";

const sectionSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true },
    /** Denormalised for search ranking and citations; kept in sync on rename. */
    documentTitle: { type: String, required: true },
    sectionTitle: { type: String, required: true },
    parentHeading: { type: String, default: null },
    headingPath: { type: [String], default: [] },
    content: { type: String, required: true },
    sectionIndex: { type: Number, required: true, min: 0 },
    charCount: { type: Number, required: true, min: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "sections" },
);

sectionSchema.index({ documentId: 1, sectionIndex: 1 }, { unique: true, name: "doc_section_index" });
sectionSchema.index(
  { sectionTitle: "text", documentTitle: "text", content: "text" },
  {
    name: "section_text",
    weights: { sectionTitle: 6, documentTitle: 2, content: 1 },
    default_language: "english",
  },
);

export type Section = InferSchemaType<typeof sectionSchema>;
export const SectionModel = model("Section", sectionSchema);
