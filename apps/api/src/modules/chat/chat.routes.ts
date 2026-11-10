import { Router, type RequestHandler } from "express";
import { IDEMPOTENCY_HEADER, askQuestionSchema, idempotencyKeySchema } from "@ika/shared";
import { validateBody } from "../../middleware/validate.js";
import { ValidationError } from "../../utils/errors.js";
import { sendSuccess } from "../../utils/response.js";
import type { ChatService } from "./chat.service.js";

export function chatRouter(chat: ChatService, perUserLimiter: RequestHandler): Router {
  const router = Router();
  router.post("/", perUserLimiter, validateBody(askQuestionSchema), async (req, res) => {
    const rawKey = req.get(IDEMPOTENCY_HEADER);
    let key: string | undefined;
    if (rawKey !== undefined) {
      const parsed = idempotencyKeySchema.safeParse(rawKey);
      if (!parsed.success) throw new ValidationError(`The ${IDEMPOTENCY_HEADER} header is invalid.`);
      key = parsed.data;
    }
    const result = await chat.ask(req.auth!.user, req.auth!.role, req.body.question, key);
    sendSuccess(res, result, result.found ? "Answer generated" : "No supported answer found");
  });
  return router;
}
