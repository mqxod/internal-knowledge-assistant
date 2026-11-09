import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { ERROR_CODES, type ApiFailure } from "@ika/shared";

const limitedBody: ApiFailure = {
  success: false,
  message: "Too many requests. Please slow down and try again shortly.",
  code: ERROR_CODES.RATE_LIMITED,
  error: { code: ERROR_CODES.RATE_LIMITED },
};

/** Per-IP limiter for the whole API (in-memory: correct for the single-instance deployment). */
export function apiRateLimiter(perMinute: number) {
  return rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: limitedBody,
  });
}

/** Per-user limiter for the expensive chat endpoint. Runs after authentication. */
export function chatRateLimiter(perMinute: number) {
  return rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.auth?.user._id.toString() ?? ipKeyGenerator(req.ip ?? ""),
    message: limitedBody,
  });
}
