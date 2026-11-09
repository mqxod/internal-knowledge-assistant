import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import { ERROR_CODES, type ApiFailure } from "@ika/shared";
import type { Logger } from "../config/logger.js";
import { AppError, MonthlyLimitError } from "../utils/errors.js";

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiFailure = {
    success: false,
    message: "Route not found.",
    code: ERROR_CODES.NOT_FOUND,
    error: { code: ERROR_CODES.NOT_FOUND },
  };
  res.status(404).json(body);
};

/** Converts every error into the standard envelope. Internals never reach the client. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let appError: AppError;
    if (err instanceof AppError) {
      appError = err;
    } else if (err instanceof mongoose.Error.CastError) {
      appError = new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Invalid identifier.");
    } else if ((err as { type?: string })?.type === "entity.too.large") {
      appError = new AppError(413, ERROR_CODES.FILE_TOO_LARGE, "The request body is too large.");
    } else if ((err as { type?: string })?.type === "entity.parse.failed") {
      appError = new AppError(400, ERROR_CODES.VALIDATION_ERROR, "The request body is not valid JSON.");
    } else {
      appError = new AppError(500, ERROR_CODES.INTERNAL_SERVER_ERROR, "Something went wrong on our side. Please try again.");
    }

    if (appError.status >= 500) {
      logger.error({ reqId: req.requestId, code: appError.code, err: err instanceof AppError ? undefined : err }, "Request failed");
    }

    const body: ApiFailure = {
      success: false,
      message: appError.message,
      code: appError.code,
      error: { code: appError.code, ...(appError.details !== undefined ? { details: appError.details } : {}) },
      ...(appError instanceof MonthlyLimitError ? { usage: appError.usage } : {}),
    };
    if (res.headersSent) return;
    res.status(appError.status).json(body);
  };
}
