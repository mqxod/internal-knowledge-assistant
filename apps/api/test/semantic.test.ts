import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DocumentModel } from "../src/modules/documents/document.model.js";
import { pointIdForSection } from "../src/modules/vector/vector.types.js";
import { CONFIDENTIAL_MD, HANDBOOK_MD } from "./fixtures.js";
import { api, buildTestContext, closeDatabase, createUser, resetDatabase, uploadDoc, type TestContext } from "./helpers/app.js";

let ctx: TestContext;
let admin: Awaited<ReturnType<typeof createUser>>;
let member: Awaited<ReturnType<typeof createUser>>;
let handbookId: string;
let execId: string;

beforeAll(async () => {
  ctx = await buildTestContext({ VECTOR_MIN_SCORE: "0.2" }, { semantic: true });
});
beforeEach(async () => {
  await resetDatabase();
  ctx.ai.reset();
  ctx.vectors!.store.points.clear();
  ctx.vectors!.store.failing = false;
  ctx.vectors!.embedder.failing = false;
  admin = await createUser(ctx, { role: "admin" });
  member = await createUser(ctx, { role: "member" });
  handbookId = (await uploadDoc(ctx, admin.token(), "handbook.md", HANDBOOK_MD, "all")).body.data.id;
  execId = (await uploadDoc(ctx, admin.token(), "exec.md", CONFIDENTIAL_MD, "admin-only")).body.data.id;
});
afterAll(closeDatabase);

const auth = () => ({ Authorization: `Bearer ${admin.token()}` });
const search = (q: string, role: "admin" | "member") => ctx.container.search.search(q, role);

describe("vector indexing", () => {
  it("stores one vector per section with the document's access level before marking it ready", async () => {
    const detail = await api(ctx).get(`/api/v1/documents/${handbookId}`).set(auth());
    const points = ctx.vectors!.store.byDocument(handbookId);
    expect(points).toHaveLength(detail.body.data.sections.length);
    expect(points.every((p) => p.payload.accessLevel === "all")).toBe(true);
    for (const s of detail.body.data.sections) expect(ctx.vectors!.store.points.has(pointIdForSection(s.id))).toBe(true);
    expect(ctx.vectors!.store.byDocument(execId).every((p) => p.payload.accessLevel === "admin-only")).toBe(true);
    expect((await DocumentModel.findById(handbookId))!.vectorIndexedAt).toBeInstanceOf(Date);
  });

  it("deleting a document removes its vectors", async () => {
    await api(ctx).delete(`/api/v1/documents/${handbookId}`).set(auth()).expect(200);
    expect(ctx.vectors!.store.byDocument(handbookId)).toHaveLength(0);
  });

  it("an embedding outage doesn't fail the upload; backfill indexes it later", async () => {
    ctx.vectors!.embedder.failing = true;
    const res = await uploadDoc(ctx, admin.token(), "policy.txt", "TRAVEL POLICY\n\nFLIGHTS\nEconomy class for flights under six hours.\n");
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("ready");
    expect((await DocumentModel.findById(res.body.data.id))!.vectorIndexedAt).toBeNull();
    expect(ctx.vectors!.store.byDocument(res.body.data.id)).toHaveLength(0);

    ctx.vectors!.embedder.failing = false;
    expect(await ctx.container.semantic!.backfill()).toEqual({ indexed: 1, failed: 0 });
    expect(ctx.vectors!.store.byDocument(res.body.data.id).length).toBeGreaterThan(0);
    expect((await DocumentModel.findById(res.body.data.id))!.vectorIndexedAt).toBeInstanceOf(Date);
  });
});

describe("hybrid retrieval", () => {
  it("finds paraphrased questions that keyword search misses", async () => {
    const results = await search("How much vacation do I get?", "member");
    expect(results[0]).toMatchObject({ sectionTitle: "Annual Leave", documentTitle: "Employee Handbook" });
    expect(results[0]!.matchedBy).toContain("semantic");
  });

  it("marks sections found by both retrievers", async () => {
    const results = await search("annual leave days", "member");
    expect(results[0]!.matchedBy).toEqual(["keyword", "semantic"]);
  });

  it("never returns admin-only sections to members via the vector path", async () => {
    const member_ = await search("executive incentive payout", "member");
    expect(member_.every((r) => r.documentId !== execId)).toBe(true);
    const admin_ = await search("executive incentive payout", "admin");
    expect(admin_.some((r) => r.documentId === execId && r.sectionTitle === "Bonus Pool")).toBe(true);
  });

  it("a stale vector payload cannot widen access: MongoDB decides", async () => {
    await ctx.vectors!.store.updateDocumentPayload(execId, { accessLevel: "all" }); // simulate drift
    const results = await search("executive incentive payout", "member");
    expect(results.every((r) => r.documentId !== execId)).toBe(true);
  });

  it("restricting a document updates the vector payload and hides it from members at once", async () => {
    await api(ctx).patch(`/api/v1/documents/${handbookId}`).set(auth()).send({ accessLevel: "admin-only" }).expect(200);
    expect(ctx.vectors!.store.byDocument(handbookId).every((p) => p.payload.accessLevel === "admin-only")).toBe(true);
    expect(await search("How much vacation do I get?", "member")).toEqual([]);
  });

  it("renames apply to semantic hits immediately (titles come from MongoDB)", async () => {
    ctx.vectors!.store.failing = true; // payload update can't land
    await api(ctx).patch(`/api/v1/documents/${handbookId}`).set(auth()).send({ title: "People Handbook" }).expect(200);
    ctx.vectors!.store.failing = false;
    const [top] = await search("How much vacation do I get?", "member");
    expect(top!.documentTitle).toBe("People Handbook");
  });

  it("falls back to keyword search when the vector DB is down", async () => {
    ctx.vectors!.store.failing = true;
    const results = await search("annual leave days", "member");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.matchedBy.join() === "keyword")).toBe(true);
    expect(await search("How much vacation do I get?", "member")).toEqual([]);
  });

  it("answers a paraphrased question end to end with citations", async () => {
    const res = await api(ctx)
      .post("/api/v1/chat")
      .set("Authorization", `Bearer ${member.token()}`)
      .send({ question: "How much vacation do I get?" });
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.sources[0]).toMatchObject({ documentTitle: "Employee Handbook", sectionTitle: "Annual Leave" });
    expect(JSON.stringify(ctx.ai.calls)).not.toContain("bonus pool");
  });
});
