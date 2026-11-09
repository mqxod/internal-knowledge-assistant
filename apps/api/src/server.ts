import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createLogger } from "./config/logger.js";
import { createContainer } from "./container.js";
import { connectDatabase, disconnectDatabase } from "./database/connection.js";
import { ensureIndexes } from "./database/indexes.js";

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const logger = createLogger(config.logLevel, config.env === "development");
  await connectDatabase(config.mongoUri, logger);
  await ensureIndexes();

  const container = createContainer(config, logger);
  const app = createApp(container);

  const maintenance = async () => {
    await container.usage.releaseStaleReservations().catch((err) => logger.error({ err }, "Reservation sweep failed"));
    await container.documents.recoverStaleProcessing(10 * 60_000).catch((err) => logger.error({ err }, "Ingestion recovery failed"));
  };
  await maintenance();
  const timer = setInterval(maintenance, 60_000);
  timer.unref();

  const server = app.listen(config.port, () => logger.info({ port: config.port, ai: { provider: config.ai.provider, model: config.ai.model } }, "API listening"));
  server.requestTimeout = config.ai.timeoutMs + 15_000;

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    clearInterval(timer);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
