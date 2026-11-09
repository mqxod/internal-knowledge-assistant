import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentModel } from "../src/modules/documents/document.model.js";
import { SectionModel } from "../src/modules/documents/section.model.js";
import { AuditLogModel } from "../src/modules/audit/audit.model.js";
import { HANDBOOK_MD, SECURITY_TXT } from "./fixtures.js";
import { api, buildTestContext, closeDatabase, createUser, resetDatabase, uploadDoc, type TestContext } from "./helpers/app.js";

let ctx: TestContext;
let adminToken: string;
beforeAll(async () => {
  ctx = await buildTestContext({ MAX_UPLOAD_SIZE_MB: "0.01" }); // ~10 KB
});
beforeEach(async () => {
  await resetDatabase();
  adminToken = (await createUser(ctx, { role: "admin" })).token();
});
afterAll(closeDatabase);

describe("document upload", () => {
  it("ingests Markdown into heading-aware sections and marks it ready", async () => {
    const res = await uploadDoc(ctx, adminToken, "handbook.md", HANDBOOK_MD);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "Employee Handbook",
      contentType: "markdown",
      status: "ready",
      sectionCount: 2,
      accessLevel: "all",
      errorCode: null,
    });
    const sections = await SectionModel.find({ documentId: res.body.data.id }).sort({ sectionIndex: 1 }).lean();
    expect(sections.map((s) => s.sectionTitle)).toEqual(["Annual Leave", "Sick Leave"]);
    expect(sections.every((s) => s.documentTitle === "Employee Handbook")).toBe(true);
    expect(await AuditLogModel.countDocuments({ action: "document.upload" })).toBe(1);
  });

  it("ingests plain text", async () => {
    const res = await uploadDoc(ctx, adminToken, "security.txt", SECURITY_TXT, "admin-only");
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ contentType: "text", status: "ready", sectionCount: 2, accessLevel: "admin-only" });
  });

  it("accepts .md sent as application/octet-stream (browser quirk)", async () => {
    const res = await uploadDoc(ctx, adminToken, "handbook.md", HANDBOOK_MD, "all", "application/octet-stream");
    expect(res.status).toBe(201);
  });

  it("rejects unsupported extensions and MIME types", async () => {
    const pdf = await uploadDoc(ctx, adminToken, "file.pdf", "%PDF-1.4", "all", "application/pdf");
    expect(pdf.status).toBe(415);
    expect(pdf.body.code).toBe("UNSUPPORTED_FILE_TYPE");
    const disguised = await uploadDoc(ctx, adminToken, "file.md", "<html>", "all", "text/html");
    expect(disguised.status).toBe(415);
    expect(await DocumentModel.countDocuments()).toBe(0);
  });

  it("rejects oversized files", async () => {
    const res = await uploadDoc(ctx, adminToken, "big.md", `# Big\n\n${"a".repeat(20_000)}`);
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects empty and whitespace-only documents", async () => {
    for (const content of ["", "   \n\n  ", "# \n\n---\n"]) {
      const res = await uploadDoc(ctx, adminToken, "empty.md", content);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("EMPTY_DOCUMENT");
    }
  });

  it("rejects binary or non-UTF-8 content", async () => {
    const res = await api(ctx)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x00, 0x41]), { filename: "bin.md", contentType: "text/markdown" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_FILE_ENCODING");
  });

  it("rejects missing files and invalid access levels", async () => {
    const none = await api(ctx).post("/api/v1/documents").set("Authorization", `Bearer ${adminToken}`).field("accessLevel", "all");
    expect(none.status).toBe(400);
    const bad = await api(ctx)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("accessLevel", "public")
      .attach("file", Buffer.from(HANDBOOK_MD), "h.md");
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate content (even with CRLF line endings)", async () => {
    expect((await uploadDoc(ctx, adminToken, "a.md", HANDBOOK_MD)).status).toBe(201);
    const dup = await uploadDoc(ctx, adminToken, "b.md", HANDBOOK_MD.replace(/\n/g, "\r\n"));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DOCUMENT_ALREADY_EXISTS");
    expect(dup.body.message).toContain("Employee Handbook");
    expect(await DocumentModel.countDocuments()).toBe(1);
  });

  it("rolls back sections and marks the document failed when persistence fails", async () => {
    const original = DocumentModel.updateOne.bind(DocumentModel);
    const spy = vi.spyOn(DocumentModel, "updateOne").mockImplementationOnce(() => {
      throw new Error("simulated write failure");
    });
    const res = await uploadDoc(ctx, adminToken, "handbook.md", HANDBOOK_MD);
    spy.mockRestore();
    void original;

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("PROCESSING_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("simulated");
    const doc = await DocumentModel.findById(res.body.error.details.documentId).lean();
    expect(doc).toMatchObject({ status: "failed", errorCode: "PROCESSING_ERROR", sectionCount: 0 });
    expect(await SectionModel.countDocuments({ documentId: doc!._id })).toBe(0);

    // A failed upload can be retried with the same content.
    const retry = await uploadDoc(ctx, adminToken, "handbook.md", HANDBOOK_MD);
    expect(retry.status).toBe(201);
    expect(await DocumentModel.countDocuments()).toBe(1);
  });

  it("marks documents failed when they exceed the section limit", async () => {
    const strict = await buildTestContext({ MAX_SECTIONS_PER_DOCUMENT: "3" });
    const token = (await createUser(strict, { role: "admin" })).token();
    const md = Array.from({ length: 6 }, (_, i) => `## Topic ${i}\n\nBody ${i}.`).join("\n\n");
    const res = await uploadDoc(strict, token, "many.md", md);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("TOO_MANY_SECTIONS");
    expect(await DocumentModel.findById(res.body.error.details.documentId).lean()).toMatchObject({ status: "failed" });
    expect(await SectionModel.countDocuments()).toBe(0);
  });

  it("recovers documents stuck in processing after a crash", async () => {
    const admin = await createUser(ctx, { role: "admin" });
    const stuck = await DocumentModel.create({
      title: "Stuck", filename: "s.md", contentType: "markdown", sizeBytes: 1, contentHash: "x",
      uploadedBy: admin.user._id, status: "processing", processingStartedAt: new Date(Date.now() - 3_600_000),
    });
    expect(await ctx.container.documents.recoverStaleProcessing(60_000)).toBe(1);
    expect((await DocumentModel.findById(stuck._id))!.status).toBe("failed");
  });
});

describe("document management", () => {
  it("lists with pagination and filters, and returns details with sections", async () => {
    const a = await uploadDoc(ctx, adminToken, "handbook.md", HANDBOOK_MD);
    await uploadDoc(ctx, adminToken, "security.txt", SECURITY_TXT, "admin-only");
    const auth = { Authorization: `Bearer ${adminToken}` };

    const page = await api(ctx).get("/api/v1/documents?pageSize=1&page=2").set(auth);
    expect(page.body.data).toMatchObject({ total: 2, totalPages: 2, page: 2 });
    expect(page.body.data.items).toHaveLength(1);

    const filtered = await api(ctx).get("/api/v1/documents?accessLevel=admin-only").set(auth);
    expect(filtered.body.data.items.map((d: { filename: string }) => d.filename)).toEqual(["security.txt"]);

    const searched = await api(ctx).get("/api/v1/documents?search=handbook&status=ready").set(auth);
    expect(searched.body.data.total).toBe(1);
    expect(searched.body.data.items[0].uploadedBy.email).toMatch(/@example.com$/);

    const detail = await api(ctx).get(`/api/v1/documents/${a.body.data.id}`).set(auth);
    expect(detail.body.data.sections.map((s: { sectionTitle: string }) => s.sectionTitle)).toEqual(["Annual Leave", "Sick Leave"]);

    const stats = await api(ctx).get("/api/v1/documents/stats").set(auth);
    expect(stats.body.data).toMatchObject({ total: 2, ready: 2, processing: 0, failed: 0, adminOnly: 1 });
  });

  it("returns 404 for unknown documents and 400 for malformed ids", async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const missing = await api(ctx).get("/api/v1/documents/507f1f77bcf86cd799439011").set(auth);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("DOCUMENT_NOT_FOUND");
    expect((await api(ctx).get("/api/v1/documents/not-an-id").set(auth)).status).toBe(400);
  });

  it("updates access level and title, keeping section titles consistent", async () => {
    const a = await uploadDoc(ctx, adminToken, "handbook.md", HANDBOOK_MD);
    const res = await api(ctx)
      .patch(`/api/v1/documents/${a.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ accessLevel: "admin-only", title: "Staff Handbook" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ accessLevel: "admin-only", title: "Staff Handbook" });
    const titles = await SectionModel.distinct("documentTitle", { documentId: a.body.data.id });
    expect(titles).toEqual(["Staff Handbook"]);
    expect(await AuditLogModel.countDocuments({ action: "document.update" })).toBe(1);
  });

  it("deletes a document together with all its sections", async () => {
    const a = await uploadDoc(ctx, adminToken, "handbook.md", HANDBOOK_MD);
    const b = await uploadDoc(ctx, adminToken, "security.txt", SECURITY_TXT);
    const res = await api(ctx).delete(`/api/v1/documents/${a.body.data.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(await DocumentModel.findById(a.body.data.id)).toBeNull();
    expect(await SectionModel.countDocuments({ documentId: a.body.data.id })).toBe(0);
    expect(await SectionModel.countDocuments({ documentId: b.body.data.id })).toBe(2);
    expect(await AuditLogModel.countDocuments({ action: "document.delete" })).toBe(1);
  });
});
