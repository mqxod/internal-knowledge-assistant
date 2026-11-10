import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SIGN_IN_AS_HEADER } from "@ika/shared";
import { AuditLogModel } from "../src/modules/audit/audit.model.js";
import { UserModel } from "../src/modules/users/user.model.js";
import { CONFIDENTIAL_MD, HANDBOOK_MD } from "./fixtures.js";
import { signSessionToken } from "./helpers/jwt.js";
import { api, buildTestContext, closeDatabase, createUser, resetDatabase, uploadDoc, type TestContext } from "./helpers/app.js";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await buildTestContext({ ADMIN_EMAILS: " Boss@Example.com , second.admin@example.com" });
});
beforeEach(async () => {
  await resetDatabase();
  ctx.ai.reset();
});
afterAll(closeDatabase);

const me = (token: string, signInAs?: string) => {
  const r = api(ctx).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
  return signInAs ? r.set(SIGN_IN_AS_HEADER, signInAs) : r;
};

describe("ADMIN_EMAILS allowlist", () => {
  it("creates an allowlisted, verified newcomer as admin (case-insensitive)", async () => {
    ctx.identity.profiles.set("user_boss", { email: "boss@example.com", emailVerified: true, name: "Boss" });
    const res = await me(signSessionToken({ sub: "user_boss" }), "admin");
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("admin");
    expect(res.body.data.adminEligible).toBe(true);
  });

  it("promotes an existing allowlisted member on their next request, with an audit entry", async () => {
    const u = await createUser(ctx, { role: "member", email: "second.admin@example.com" });
    expect((await me(u.token())).body.data.user.role).toBe("admin");
    expect((await UserModel.findById(u.user._id))!.role).toBe("admin");
    const log = await AuditLogModel.findOne({ action: "user.role_change", resourceId: u.user._id }).lean();
    expect(log).toMatchObject({ actorId: null, metadata: { from: "member", to: "admin", reason: "admin_allowlist" } });
  });

  it("never grants admin to emails that aren't allowlisted, whatever the client asks for", async () => {
    ctx.identity.profiles.set("user_x", { email: "someone@example.com", emailVerified: true, name: "X" });
    const token = signSessionToken({ sub: "user_x" });
    const res = await me(token, "admin");
    expect(res.body.data.user.role).toBe("member");
    expect(res.body.data.adminEligible).toBe(false);
    const upload = await api(ctx)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .set(SIGN_IN_AS_HEADER, "admin")
      .attach("file", Buffer.from(HANDBOOK_MD), { filename: "h.md", contentType: "text/markdown" });
    expect(upload.status).toBe(403);
  });

  it("does not promote unverified emails or disabled accounts", async () => {
    ctx.identity.profiles.set("user_unv", { email: "boss@example.com", emailVerified: false, name: "B" });
    expect((await me(signSessionToken({ sub: "user_unv" }))).status).toBe(403);
    const disabled = await createUser(ctx, { role: "member", status: "disabled", email: "second.admin@example.com" });
    expect((await me(disabled.token())).status).toBe(403);
    expect((await UserModel.findById(disabled.user._id))!.role).toBe("member");
  });
});

describe("signing in as member", () => {
  it("an admin who chooses Member gets member access for that session only", async () => {
    const admin = await createUser(ctx, { role: "admin" });
    await uploadDoc(ctx, admin.token(), "handbook.md", HANDBOOK_MD, "all");
    await uploadDoc(ctx, admin.token(), "exec.md", CONFIDENTIAL_MD, "admin-only");

    const asMember = await me(admin.token(), "member");
    expect(asMember.body.data).toMatchObject({ user: { role: "member" }, adminEligible: true });
    expect((await api(ctx).get("/api/v1/documents").set("Authorization", `Bearer ${admin.token()}`).set(SIGN_IN_AS_HEADER, "member")).status).toBe(403);

    const chat = await api(ctx)
      .post("/api/v1/chat")
      .set("Authorization", `Bearer ${admin.token()}`)
      .set(SIGN_IN_AS_HEADER, "member")
      .send({ question: "How many annual leave days can be sold back, and what is the bonus pool?" });
    expect(chat.status).toBe(200);
    expect(JSON.stringify(ctx.ai.calls)).not.toContain("bonus pool for next year");

    // The stored role is untouched; without the header they're an admin again.
    expect((await UserModel.findById(admin.user._id))!.role).toBe("admin");
    expect((await api(ctx).get("/api/v1/documents").set("Authorization", `Bearer ${admin.token()}`)).status).toBe(200);
  });

  it("ignores unknown header values", async () => {
    const admin = await createUser(ctx, { role: "admin" });
    expect((await me(admin.token(), "superuser")).body.data.user.role).toBe("admin");
  });
});
