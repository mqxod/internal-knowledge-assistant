import { ERROR_CODES, type ErrorCode, type UsageSummary } from "@ika/shared";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required.") {
    super(401, ERROR_CODES.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.", code: ErrorCode = ERROR_CODES.FORBIDDEN) {
    super(403, code, message);
  }
}

export class ValidationError extends AppError {
  constructor(message = "The request is invalid.", details?: unknown) {
    super(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(code: ErrorCode = ERROR_CODES.NOT_FOUND, message = "The requested resource was not found.") {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(409, code, message);
  }
}

export class MonthlyLimitError extends AppError {
  constructor(public readonly usage: UsageSummary) {
    super(429, ERROR_CODES.MONTHLY_LIMIT_REACHED, "You've reached your monthly question limit.");
  }
}

export class AIProviderError extends AppError {
  constructor(
    message = "The AI service is temporarily unavailable. Please try again shortly.",
    public readonly reason?: string,
  ) {
    super(502, ERROR_CODES.AI_PROVIDER_ERROR, message);
  }
}

export class AITimeoutError extends AppError {
  constructor() {
    super(504, ERROR_CODES.AI_TIMEOUT, "The AI service took too long to respond. Please try again.");
  }
}

export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;
}
