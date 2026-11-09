/**
 * Provisions the first administrator from an existing, email-verified Clerk user.
 *   pnpm bootstrap:admin --clerk-user-id user_2abc...
 * Requires direct access to the server environment (MongoDB + Clerk secret) — there is no
 * HTTP endpoint for this, so admin rights cannot be self-granted through the application.
 */
import { parseArgs } from "node:util";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../config/logger.js";
import { createContainer } from "../container.js";
import { connectDatabase, disconnectDatabase } from "../database/connection.js";
import { ensureIndexes } from "../database/indexes.js";

const { values } = parseArgs({ options: { "clerk-user-id": { type: "string" } } });
const clerkUserId = values["clerk-user-id"];
if (!clerkUserId || !/^user_[A-Za-z0-9]+$/.test(clerkUserId)) {
  console.error("Usage: bootstrap-admin --clerk-user-id user_XXXXXXXX");
  process.exit(1);
}

const config = loadConfig();
const logger = createLogger("warn");
await connectDatabase(config.mongoUri, logger);
await ensureIndexes();
try {
  const user = await createContainer(config, logger).users.bootstrapAdmin(clerkUserId);
  console.log(`✔ ${user.email} is now an active administrator (id ${user.id}).`);
} catch (err) {
  console.error(`✖ ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
