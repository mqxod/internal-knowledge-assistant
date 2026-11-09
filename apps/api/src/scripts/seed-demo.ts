/**
 * Ingests the fictional demo documents through the real ingestion pipeline.
 *   pnpm seed:demo --admin-email admin@example.com [--dir ./demo-documents]
 * Files whose name contains "confidential" are uploaded as admin-only.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../config/logger.js";
import { createContainer } from "../container.js";
import { connectDatabase, disconnectDatabase } from "../database/connection.js";
import { ensureIndexes } from "../database/indexes.js";
import { UserModel } from "../modules/users/user.model.js";
import { AppError } from "../utils/errors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: { "admin-email": { type: "string" }, dir: { type: "string" } },
});
const dir = path.resolve(values.dir ?? path.join(here, "../../../../demo-documents"));
const email = values["admin-email"]?.toLowerCase();
if (!email) {
  console.error("Usage: seed-demo --admin-email admin@example.com [--dir path]");
  process.exit(1);
}

const config = loadConfig();
const logger = createLogger("warn");
await connectDatabase(config.mongoUri, logger);
await ensureIndexes();
try {
  const admin = await UserModel.findOne({ email, role: "admin", status: "active" });
  if (!admin) throw new Error(`No active admin with email ${email}. Run bootstrap:admin first.`);
  const { documents } = createContainer(config, logger);
  const files = (await readdir(dir)).filter((f) => /\.(md|txt)$/i.test(f)).sort();
  for (const name of files) {
    const buffer = await readFile(path.join(dir, name));
    const file = {
      originalname: name,
      mimetype: name.endsWith(".txt") ? "text/plain" : "text/markdown",
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
    try {
      const doc = await documents.upload(
        file,
        { accessLevel: /confidential/i.test(name) ? "admin-only" : "all" },
        admin,
      );
      console.log(`✔ ${doc.title} — ${doc.sectionCount} sections (${doc.accessLevel})`);
    } catch (err) {
      console.log(`• ${name}: ${err instanceof AppError ? err.message : (err as Error).message}`);
    }
  }
} catch (err) {
  console.error(`✖ ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
