import cors from "cors";
import express, { Router, type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { IDEMPOTENCY_HEADER } from "@ika/shared";
import type { Container } from "./container.js";
import { isDatabaseConnected } from "./database/connection.js";
import { authenticate, requireActiveUser, requireRole } from "./middleware/authenticate.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { apiRateLimiter, chatRateLimiter } from "./middleware/rate-limit.js";
import { requestId } from "./middleware/request-id.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { chatRouter } from "./modules/chat/chat.routes.js";
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { usageRouter } from "./modules/usage/usage.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export function createApp(c: Container): Express {
  const { config, logger } = c;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId ?? "",
      autoLogging: { ignore: (req) => req.url === "/api/v1/health" },
      // Only method/url/status/timing — no bodies, no auth headers.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: [config.frontendUrl],
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Authorization", "Content-Type", IDEMPOTENCY_HEADER, "X-Request-Id"],
      credentials: false,
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "16kb" }));

  const api = Router();
  api.get("/health", (_req, res) => {
    const db = isDatabaseConnected();
    res.status(db ? 200 : 503).json({ status: db ? "ok" : "degraded" });
  });

  api.use(apiRateLimiter(config.limits.apiRateLimitPerMinute));

  // Everything below requires a verified session and an active, provisioned account.
  api.use(authenticate(c.identity, c.users, logger), requireActiveUser);

  const anyRole = requireRole(["admin", "member"]);
  const adminOnly = requireRole(["admin"], { requireAdminMfa: config.clerk.requireAdminMfa });

  api.use("/auth", anyRole, authRouter(config));
  api.use("/usage", anyRole, usageRouter(c.usage));
  api.use("/chat", anyRole, chatRouter(c.chat, chatRateLimiter(config.limits.chatRateLimitPerMinute)));
  api.use("/documents", adminOnly, documentsRouter(c.documents, config.limits.maxUploadSizeBytes));
  api.use("/users", adminOnly, usersRouter(c.users));
  api.use("/audit-logs", adminOnly, auditRouter(c.audit));

  app.use("/api/v1", api);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
