import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ReservationModel } from "../src/modules/usage/reservation.model.js";
import { UsageModel } from "../src/modules/usage/usage.model.js";
import { AIProviderError } from "../src/utils/errors.js";
import { monthKey, nextMonthStart } from "../src/utils/month.js";
import { HANDBOOK_MD } from "./fixtures.js";
import { api, buildTestContext, closeDatabase, createUser, resetDatabase, uploadDoc, type TestContext } from "./helpers/app.js";

let ctx: TestContext;
let member: Awaited<ReturnType<typeof createUser>>;
const QUESTION = "How many annual leave days do employees receive?";

beforeAll(async () => {
  ctx = await buildTestContext({ MONTHLY_QUERY_LIMIT: "3", CHAT_RATE_LIMIT_PER_MINUTE: "1000" });
});
beforeEach(async () => {
  await resetDatabase();
  ctx.ai.reset();
  ctx.clock.now = new Date("2026-11-15T12:00:00Z");
  const admin = await createUser(ctx, { role: "admin" });
  member = await createUser(ctx);
  await uploadDoc(ctx, admin.token(), "handbook.md", HANDBOOK_MD);
});
afterAll(closeDatabase);

const ask = (token: string, key?: string, question = QUESTION) => {
  const r = api(ctx).post("/api/v1/chat").set("Authorization", `Bearer ${token}`);
  if (key) r.set("Idempotency-Key", key);
  return r.send({ question });
};
const used = async (userId = member.user._id) =>
  (await UsageModel.findOne({ userId, month: monthKey(ctx.clock.now) }))?.requestCount ?? 0;

describe("monthly quota", () => {
  it("reports usage with remaining questions and the reset date", async () => {
    await ask(member.token());
    const res = await api(ctx).get("/api/v1/usage/me").set("Authorization", `Bearer ${member.token()}`);
    expect(res.body.data).toEqual({ used: 1, limit: 3, remaining: 2, resetsAt: "2026-12-01T00:00:00.000Z", month: "2026-11" });
  });

  it("enforces the limit with a 429 that includes usage and reset date", async () => {
    for (let i = 0; i < 3; i++) expect((await ask(member.token())).status).toBe(200);
    const res = await ask(member.token());
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      success: false,
      code: "MONTHLY_LIMIT_REACHED",
      message: "You've reached your monthly question limit.",
      usage: { used: 3, limit: 3, remaining: 0, resetsAt: "2026-12-01T00:00:00.000Z" },
    });
    expect(ctx.ai.calls).toHaveLength(3);
  });

  it("does not let concurrent requests exceed the limit", async () => {
    ctx.ai.handler = async ({ sections }) => {
      await new Promise((r) => setTimeout(r, 30));
      return { answer: { found: true, answer: "20 days.", sources: [{ sectionId: sections[0]!.sectionId }] }, usage: { inputTokens: 1, outputTokens: 1 } };
    };
    const results = await Promise.all(Array.from({ length: 12 }, () => ask(member.token())));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(3);
    expect(statuses.filter((s) => s === 429)).toHaveLength(9);
    expect(await used()).toBe(3);
    expect(ctx.ai.calls).toHaveLength(3);
  });

  it("keeps quotas independent per user", async () => {
    const other = await createUser(ctx);
    for (let i = 0; i < 3; i++) await ask(member.token());
    expect((await ask(other.token())).status).toBe(200);
    expect(await used(other.user._id)).toBe(1);
  });

  it("refunds failed requests so they do not consume successful usage", async () => {
    ctx.ai.handler = () => {
      throw new AIProviderError();
    };
    for (let i = 0; i < 5; i++) expect((await ask(member.token())).status).toBe(502);
    expect(await used()).toBe(0);
    ctx.ai.reset();
    expect((await ask(member.token())).status).toBe(200);
    expect(await used()).toBe(1);
  });

  it("counts no-answer results (policy: completed requests count)", async () => {
    await ask(member.token(), undefined, "What is the capital of France?");
    expect(await used()).toBe(1);
  });

  it("resets at the start of the next UTC month", async () => {
    for (let i = 0; i < 3; i++) await ask(member.token());
    expect((await ask(member.token())).status).toBe(429);
    ctx.clock.now = new Date("2026-12-01T00:00:00Z");
    const res = await ask(member.token());
    expect(res.status).toBe(200);
    expect(res.body.data.usage).toMatchObject({ used: 1, remaining: 2, month: "2026-12", resetsAt: "2027-01-01T00:00:00.000Z" });
  });
});

describe("idempotency and reservations", () => {
  it("replays a completed request for the same key without double counting", async () => {
    const key = "k".repeat(20);
    const first = await ask(member.token(), key);
    const second = await ask(member.token(), key);
    expect(second.status).toBe(200);
    expect(second.body.data.answer).toBe(first.body.data.answer);
    expect(second.body.data.sources).toEqual(first.body.data.sources);
    expect(second.body.data.usage.used).toBe(1);
    expect(ctx.ai.calls).toHaveLength(1);
    expect(await used()).toBe(1);
  });

  it("idempotency keys are scoped per user", async () => {
    const other = await createUser(ctx);
    const key = "shared-key-123456789";
    await ask(member.token(), key);
    const res = await ask(other.token(), key);
    expect(res.status).toBe(200);
    expect(ctx.ai.calls).toHaveLength(2);
  });

  it("rejects reuse of a key for a different question", async () => {
    const key = "reused-key-123456789";
    await ask(member.token(), key);
    const res = await ask(member.token(), key, "How do I report sick leave?");
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await used()).toBe(1);
  });

  it("rejects a concurrent duplicate while the first is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    ctx.ai.handler = async ({ sections }) => {
      await gate;
      return { answer: { found: true, answer: "20.", sources: [{ sectionId: sections[0]!.sectionId }] }, usage: { inputTokens: 1, outputTokens: 1 } };
    };
    const key = "inflight-key-1234567";
    const first = ask(member.token(), key).then((r) => r); // supertest is lazy; start it now
    await new Promise((r) => setTimeout(r, 150));
    const dup = await ask(member.token(), key);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("REQUEST_IN_PROGRESS");
    release();
    expect((await first).status).toBe(200);
    expect(await used()).toBe(1);
  });

  it("allows retrying a failed request with the same key, counting it once", async () => {
    const key = "retry-key-1234567890";
    ctx.ai.handler = () => {
      throw new AIProviderError();
    };
    expect((await ask(member.token(), key)).status).toBe(502);
    ctx.ai.reset();
    expect((await ask(member.token(), key)).status).toBe(200);
    expect(await used()).toBe(1);
  });

  it("releases a reservation exactly once (no double refund)", async () => {
    const usage = ctx.container.usage;
    await usage.reserve(member.user._id, "a".repeat(20), "h1");
    const r = await usage.reserve(member.user._id, "b".repeat(20), "h2");
    if (r.kind !== "reserved") throw new Error("expected reservation");
    expect(await used()).toBe(2);
    const outcomes = await Promise.all([usage.release(r.reservationId, "x"), usage.release(r.reservationId, "x"), usage.release(r.reservationId, "x")]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(await used()).toBe(1);
  });

  it("sweeps abandoned reservations and refunds them", async () => {
    const usage = ctx.container.usage;
    await usage.reserve(member.user._id, "c".repeat(20), "h");
    expect(await used()).toBe(1);
    await ReservationModel.updateMany({}, { $set: { createdAt: new Date("2026-11-15T11:00:00Z") } }, { timestamps: false });
    expect(await usage.releaseStaleReservations()).toBe(1);
    expect(await used()).toBe(0);
    expect(await usage.releaseStaleReservations()).toBe(0);
  });
});

describe("month calculations", () => {
  it("uses UTC calendar months", () => {
    expect(monthKey(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01");
    expect(monthKey(new Date("2026-02-01T00:00:00Z"))).toBe("2026-02");
    expect(nextMonthStart(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(nextMonthStart(new Date("2028-02-29T10:00:00Z")).toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });
});

describe("organisation AI budget", () => {
  it("stops calling the provider once the monthly budget is used and refunds the user", async () => {
    const small = await buildTestContext({ AI_MONTHLY_REQUEST_BUDGET: "1", MONTHLY_QUERY_LIMIT: "10" });
    small.clock.now = ctx.clock.now;
    expect((await api(small).post("/api/v1/chat").set("Authorization", `Bearer ${member.token()}`).send({ question: QUESTION })).status).toBe(200);
    const res = await api(small).post("/api/v1/chat").set("Authorization", `Bearer ${member.token()}`).send({ question: QUESTION });
    expect(res.status).toBe(503);
    expect(small.ai.calls).toHaveLength(1);
    expect(await used()).toBe(1);
  });
});
