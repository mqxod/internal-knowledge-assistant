import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { validateQuery } from "../../middleware/validate.js";
import type { AuditService } from "./audit.service.js";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

export function auditRouter(audit: AuditService): Router {
  const router = Router();
  router.get("/", validateQuery(querySchema), async (req, res) => {
    const { limit } = req.validatedQuery as z.infer<typeof querySchema>;
    sendSuccess(res, await audit.listRecent(limit));
  });
  return router;
}
