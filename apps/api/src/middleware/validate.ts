import type { RequestHandler } from "express";
import type { z } from "zod";
import { ValidationError } from "../utils/errors.js";

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}

function formatIssues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return next(new ValidationError("The request body is invalid.", formatIssues(parsed.error)));
    req.body = parsed.data;
    next();
  };
}

/** Express 5 makes req.query read-only, so the parsed result goes on req.validatedQuery. */
export function validateQuery(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return next(new ValidationError("The query parameters are invalid.", formatIssues(parsed.error)));
    req.validatedQuery = parsed.data;
    next();
  };
}

export function validateParams(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) return next(new ValidationError("The request path is invalid.", formatIssues(parsed.error)));
    next();
  };
}
