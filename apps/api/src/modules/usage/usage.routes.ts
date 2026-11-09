import { Router } from "express";
import { sendSuccess } from "../../utils/response.js";
import type { UsageService } from "./usage.service.js";

export function usageRouter(usage: UsageService): Router {
  const router = Router();
  router.get("/me", async (req, res) => {
    sendSuccess(res, await usage.getSummary(req.auth!.user._id));
  });
  return router;
}
