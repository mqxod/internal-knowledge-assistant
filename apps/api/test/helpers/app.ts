import mongoose from "mongoose";
import request from "supertest";
import { inject } from "vitest";
import { createApp } from "../../src/app.js";
import { loadConfig, type AppConfig } from "../../src/config/env.js";
import { createLogger } from "../../src/config/logger.js";
import { createContainer, type Container } from "../../src/container.js";
import { ensureIndexes } from "../../src/database/indexes.js";
import { ClerkIdentityProvider } from "../../src/modules/auth/clerk.identity.js";
import type { IdentityProfile } from "../../src/modules/auth/identity.types.js";
import { UserModel } from "../../src/modules/users/user.model.js";
import { FakeAI } from "./fake-ai.js";
import { TEST_JWT_PUBLIC_KEY, signSessionToken, type TokenOptions } from "./jwt.js";

/**
 * Real Clerk token verification (signature, exp/nbf, azp) using a pinned local key.
 * Only the profile lookup — a network call to Clerk's API — is replaced.
 */
export class TestIdentityProvider extends ClerkIdentityProvider {
  profiles = new Map<string, IdentityProfile>();
  constructor(authorizedParties: string[]) {
    super({ secretKey: "sk_test_not_a_real_key", jwtKey: TEST_JWT_PUBLIC_KEY, authorizedParties });
  }
  override async getProfile(clerkUserId: string): Promise<IdentityProfile> {
    const p = this.profiles.get(clerkUserId);
    if (!p) throw new Error("Unknown Clerk user");
    return p;
  }
}

export interface TestContext {
  app: ReturnType<typeof createApp>;
  container: Container;
  config: AppConfig;
  ai: FakeAI;
  identity: TestIdentityProvider;
  clock: { now: Date };
}

let connected = false;

export async function buildTestContext(envOverrides: Record<string, string> = {}): Promise<TestContext> {
  const uri = inject("mongoUri");
  if (!connected) {
    await mongoose.connect(uri, { dbName: `ika_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}` });
    await ensureIndexes();
    connected = true;
  }
  const config = loadConfig({ ...process.env, MONGODB_URI: uri, ...envOverrides });
  const logger = createLogger("silent");
  const ai = new FakeAI();
  const identity = new TestIdentityProvider(config.clerk.authorizedParties);
  const clock = { now: new Date() };
  const container = createContainer(config, logger, { ai, identity, now: () => clock.now });
  return { app: createApp(container), container, config, ai, identity, clock };
}

export async function resetDatabase(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function closeDatabase(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  connected = false;
}

let seq = 0;
export async function createUser(
  ctx: TestContext,
  opts: { role?: "admin" | "member"; status?: "active" | "disabled"; email?: string } = {},
) {
  seq++;
  const clerkUserId = `user_test${seq}${Math.random().toString(36).slice(2, 8)}`;
  const email = opts.email ?? `${clerkUserId}@example.com`;
  const user = await UserModel.create({
    clerkUserId,
    email,
    name: `Test ${opts.role ?? "member"} ${seq}`,
    role: opts.role ?? "member",
    status: opts.status ?? "active",
  });
  return { user, clerkUserId, token: (o: Partial<TokenOptions> = {}) => signSessionToken({ sub: clerkUserId, ...o }) };
}

export function api(ctx: TestContext) {
  return request(ctx.app);
}

export async function uploadDoc(
  ctx: TestContext,
  token: string,
  filename: string,
  content: string,
  accessLevel: "all" | "admin-only" = "all",
  mimetype = filename.endsWith(".txt") ? "text/plain" : "text/markdown",
) {
  return request(ctx.app)
    .post("/api/v1/documents")
    .set("Authorization", `Bearer ${token}`)
    .field("accessLevel", accessLevel)
    .attach("file", Buffer.from(content, "utf8"), { filename, contentType: mimetype });
}
