/**
 * Vercel Functions entrypoint (Vercel Services, `api` service).
 *
 * `server.ts` is the long-running entry for Docker: it connects at boot, runs timers and calls
 * `listen`. On Vercel the app is a function instance that may be frozen between requests, so:
 *  - the MongoDB connection is opened lazily and reused while the instance stays warm;
 *  - housekeeping that used `setInterval` runs opportunistically after responses (throttled
 *    per instance) via `waitUntil`, so it never delays a request.
 * Requests keep their original path (`/api/v1/...`), which is where the routes are mounted.
 */
import { waitUntil } from "@vercel/functions";
import { ERROR_CODES, type ApiFailure } from "@ika/shared";
import express, { type NextFunction, type Request, type Response } from "express";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createLogger } from "./config/logger.js";
import { createContainer } from "./container.js";
import { connectDatabase } from "./database/connection.js";
import { ensureIndexes } from "./database/indexes.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const container = createContainer(config, logger);
const inner = createApp(container);

let ready: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  ready ??= (async () => {
    await connectDatabase(config.mongoUri, logger);
    await ensureIndexes();
  })().catch((err) => {
    ready = null; // let the next request retry instead of caching the failure
    throw err;
  });
  return ready;
}

const MAINTENANCE_EVERY_MS = 60_000;
const BACKFILL_EVERY_MS = 10 * 60_000;
let lastMaintenance = 0;
let lastBackfill = 0;

function scheduleHousekeeping(): void {
  const now = Date.now();
  const tasks: Promise<unknown>[] = [];
  if (now - lastMaintenance >= MAINTENANCE_EVERY_MS) {
    lastMaintenance = now;
    tasks.push(
      container.usage.releaseStaleReservations().catch((err) => logger.error({ err }, "Reservation sweep failed")),
      container.documents
        .recoverStaleProcessing(10 * 60_000)
        .catch((err) => logger.error({ err }, "Ingestion recovery failed")),
    );
  }
  if (container.semantic && now - lastBackfill >= BACKFILL_EVERY_MS) {
    lastBackfill = now;
    tasks.push(
      container.semantic
        .backfill({ limit: 20 })
        .catch((err) => logger.warn({ err: (err as Error).name }, "Vector backfill sweep failed")),
    );
  }
  if (tasks.length) waitUntil(Promise.all(tasks));
}

const app = express();
app.disable("x-powered-by");
app.use(async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureReady();
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Database unavailable");
    const body: ApiFailure = {
      success: false,
      message: "The service is temporarily unavailable. Please try again shortly.",
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      error: { code: ERROR_CODES.SERVICE_UNAVAILABLE },
    };
    res.status(503).json(body);
    return;
  }
  res.once("finish", scheduleHousekeeping);
  next();
});
app.use(inner);

export default app;
