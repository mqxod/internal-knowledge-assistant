import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UserModel } from "../src/modules/users/user.model.js";
import { signSessionToken } from "./helpers/jwt.js";
import { api, buildTestContext, closeDatabase, createUser, resetDatabase, type TestContext } from "./helpers/app.js";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await buildTestContext();
});
beforeEach(resetDatabase);
afterAll(closeDatabase);

const me = (token?: string) => {
  const r = api(ctx).get("/api/v1/auth/me");
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

describe("authentication", () => {
  it("rejects requests without a token", async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: "UNAUTHORIZED", error: { code: "UNAUTHORIZED" } });
  });

  it("rejects malformed and non-bearer authorization headers", async () => {
    expect((await api(ctx).get("/api/v1/auth/me").set("Authorization", "Basic abc")).status).toBe(401);
    expect((await me("not-a-jwt")).status).toBe(401);
  });

  it("rejects tokens signed with the wrong key", async () => {
    const { clerkUserId } = await createUser(ctx);
    expect((await me(signSessionToken({ sub: clerkUserId, wrongKey: true }))).status).toBe(401);
  });

  it("rejects expired tokens", async () => {
    const u = await createUser(ctx);
    expect((await me(u.token({ expiresInSec: -120 }))).status).toBe(401);
  });

  it("rejects tokens that are not yet valid", async () => {
    const u = await createUser(ctx);
    expect((await me(u.token({ notBeforeOffsetSec: 600, expiresInSec: 900 }))).status).toBe(401);
  });

  it("rejects tokens issued for a different frontend origin (azp)", async () => {
    const u = await createUser(ctx);
    expect((await me(u.token({ azp: "https://evil.example.com" }))).status).toBe(401);
  });

  it("rejects sessions that are not fully active", async () => {
    const u = await createUser(ctx);
    expect((await me(u.token({ sts: "pending" }))).status).toBe(401);
  });

  it("returns the application user for a valid token", async () => {
    const u = await createUser(ctx, { role: "member" });
    const res = await me(u.token());
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ role: "member", status: "active", email: u.user.email });
    expect(res.body.data.config.monthlyQueryLimit).toBe(100);
  });

  it("self-provisions verified identities as active members (never admin)", async () => {
    ctx.identity.profiles.set("user_stranger", { email: "stranger@example.com", emailVerified: true, name: "S" });
    const res = await me(signSessionToken({ sub: "user_stranger" }));
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: "stranger@example.com", role: "member", status: "active" });
    // Second request resolves the same record instead of creating another.
    expect((await me(signSessionToken({ sub: "user_stranger" }))).status).toBe(200);
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it("does not self-provision identities without a verified email", async () => {
    ctx.identity.profiles.set("user_unverified2", { email: "x@example.com", emailVerified: false, name: "X" });
    const res = await me(signSessionToken({ sub: "user_unverified2" }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_NOT_PROVISIONED");
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("links an invited user on first sign-in only when the email is verified", async () => {
    await UserModel.create({ email: "new.hire@example.com", name: "New Hire", role: "member" });
    ctx.identity.profiles.set("user_unverified", { email: "new.hire@example.com", emailVerified: false, name: "X" });
    expect((await me(signSessionToken({ sub: "user_unverified" }))).status).toBe(403);

    ctx.identity.profiles.set("user_newhire", { email: "new.hire@example.com", emailVerified: true, name: "New Hire" });
    const res = await me(signSessionToken({ sub: "user_newhire" }));
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: "new.hire@example.com", linked: true, role: "member" });
    // The invitation cannot be claimed again by a different Clerk identity.
    ctx.identity.profiles.set("user_impostor", { email: "new.hire@example.com", emailVerified: true, name: "I" });
    expect((await me(signSessionToken({ sub: "user_impostor" }))).status).toBe(403);
  });

  it("rejects disabled users even with a valid session", async () => {
    const u = await createUser(ctx, { status: "disabled" });
    const res = await me(u.token());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("authorization", () => {
  it("blocks members from every admin endpoint", async () => {
    const m = await createUser(ctx, { role: "member" });
    const auth = { Authorization: `Bearer ${m.token()}` };
    const id = "507f1f77bcf86cd799439011";
    const calls = [
      api(ctx).get("/api/v1/documents").set(auth),
      api(ctx).get("/api/v1/documents/stats").set(auth),
      api(ctx).get(`/api/v1/documents/${id}`).set(auth),
      api(ctx).patch(`/api/v1/documents/${id}`).set(auth).send({ accessLevel: "all" }),
      api(ctx).delete(`/api/v1/documents/${id}`).set(auth),
      api(ctx).post("/api/v1/documents").set(auth).attach("file", Buffer.from("# x\n\nhello"), "x.md"),
      api(ctx).get("/api/v1/users").set(auth),
      api(ctx).post("/api/v1/users").set(auth).send({ email: "a@b.com", name: "A", role: "admin" }),
      api(ctx).patch(`/api/v1/users/${m.user._id}`).set(auth).send({ role: "admin" }),
      api(ctx).get("/api/v1/audit-logs").set(auth),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect((await UserModel.findById(m.user._id))!.role).toBe("member");
  });

  it("ignores role claims supplied by the client", async () => {
    const m = await createUser(ctx, { role: "member" });
    const res = await api(ctx)
      .get("/api/v1/documents?role=admin")
      .set("Authorization", `Bearer ${m.token()}`)
      .set("X-User-Role", "admin");
    expect(res.status).toBe(403);
  });

  it("allows admins to reach admin endpoints", async () => {
    const a = await createUser(ctx, { role: "admin" });
    const res = await api(ctx).get("/api/v1/documents").set("Authorization", `Bearer ${a.token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ items: [], total: 0, page: 1 });
  });

  it("lets admins provision users but not change their own role or status", async () => {
    const a = await createUser(ctx, { role: "admin" });
    const auth = { Authorization: `Bearer ${a.token()}` };
    const created = await api(ctx).post("/api/v1/users").set(auth).send({ email: "Emp@Example.com", name: "Emp" });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ email: "emp@example.com", role: "member", linked: false });

    const dup = await api(ctx).post("/api/v1/users").set(auth).send({ email: "emp@example.com", name: "Emp" });
    expect(dup.status).toBe(409);

    const self = await api(ctx).patch(`/api/v1/users/${a.user._id}`).set(auth).send({ status: "disabled" });
    expect(self.status).toBe(403);
    expect(self.body.code).toBe("CANNOT_MODIFY_SELF");

    const disable = await api(ctx).patch(`/api/v1/users/${created.body.data.id}`).set(auth).send({ status: "disabled" });
    expect(disable.status).toBe(200);
    expect(disable.body.data.status).toBe("disabled");
  });

  it("rejects unknown fields in user updates (no mass assignment)", async () => {
    const a = await createUser(ctx, { role: "admin" });
    const m = await createUser(ctx);
    const res = await api(ctx)
      .patch(`/api/v1/users/${m.user._id}`)
      .set("Authorization", `Bearer ${a.token()}`)
      .send({ status: "active", clerkUserId: "user_hijack" });
    expect(res.status).toBe(400);
    expect((await UserModel.findById(m.user._id))!.clerkUserId).toBe(m.clerkUserId);
  });
});

describe("admin MFA enforcement", () => {
  it("requires a verified second factor for admin routes when enabled", async () => {
    const strict = await buildTestContext({ REQUIRE_ADMIN_MFA: "true" });
    const a = await createUser(strict, { role: "admin" });
    const noMfa = await api(strict).get("/api/v1/documents").set("Authorization", `Bearer ${a.token({ fva: [0, -1] })}`);
    expect(noMfa.status).toBe(403);
    expect(noMfa.body.code).toBe("ADMIN_MFA_REQUIRED");
    const missingClaim = await api(strict).get("/api/v1/documents").set("Authorization", `Bearer ${a.token()}`);
    expect(missingClaim.status).toBe(403);
    const withMfa = await api(strict).get("/api/v1/documents").set("Authorization", `Bearer ${a.token({ fva: [1, 1] })}`);
    expect(withMfa.status).toBe(200);
  });
});

describe("health", () => {
  it("returns minimal information without authentication", async () => {
    const res = await api(ctx).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
