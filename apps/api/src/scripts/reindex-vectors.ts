/**
 * Embeds document sections into the vector DB.
 *   pnpm reindex:vectors          # only ready documents that have no vectors yet
 *   pnpm reindex:vectors --all    # rebuild every ready document (e.g. after changing EMBEDDING_MODEL)
 */
import { parseArgs } from "node:util";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../config/logger.js";
import { createContainer } from "../container.js";
import { connectDatabase, disconnectDatabase } from "../database/connection.js";
import { ensureIndexes } from "../database/indexes.js";

const { values } = parseArgs({ options: { all: { type: "boolean", default: false } } });
const config = loadConfig();
const logger = createLogger("info");
if (!config.vector) {
  console.error("Semantic search is disabled: set VECTOR_DB_URL and an OpenAI key (EMBEDDING_API_KEY or AI_PROVIDER=openai).");
  process.exit(1);
}
await connectDatabase(config.mongoUri, logger);
await ensureIndexes();
try {
  const { semantic } = createContainer(config, logger);
  const { indexed, failed } = await semantic!.backfill({ all: values.all, limit: 100_000 });
  if (failed) throw new Error(`Indexed ${indexed} document(s), then stopped after a failure (see log above).`);
  console.log(`✔ Indexed ${indexed} document(s) into "${config.vector.collection}".`);
} catch (err) {
  console.error(`✘ ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
