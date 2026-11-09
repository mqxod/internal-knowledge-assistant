export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ACCESS_LEVELS = ["all", "admin-only"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const DOCUMENT_STATUSES = ["processing", "ready", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const CONTENT_TYPES = ["markdown", "text"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const ALLOWED_UPLOAD_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

/** Header used by the chat endpoint to make retries idempotent. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export const NO_ANSWER_MESSAGE =
  "I couldn't find enough information in the company's available documents to answer this question. Please contact your administrator for clarification.";

export const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  ACCOUNT_NOT_PROVISIONED: "ACCOUNT_NOT_PROVISIONED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  ADMIN_MFA_REQUIRED: "ADMIN_MFA_REQUIRED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  DOCUMENT_NOT_FOUND: "DOCUMENT_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  DOCUMENT_ALREADY_EXISTS: "DOCUMENT_ALREADY_EXISTS",
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  INVALID_FILE_ENCODING: "INVALID_FILE_ENCODING",
  EMPTY_DOCUMENT: "EMPTY_DOCUMENT",
  TOO_MANY_SECTIONS: "TOO_MANY_SECTIONS",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  DOCUMENT_PROCESSING: "DOCUMENT_PROCESSING",
  CANNOT_MODIFY_SELF: "CANNOT_MODIFY_SELF",
  REQUEST_IN_PROGRESS: "REQUEST_IN_PROGRESS",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  MONTHLY_LIMIT_REACHED: "MONTHLY_LIMIT_REACHED",
  RATE_LIMITED: "RATE_LIMITED",
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  AI_TIMEOUT: "AI_TIMEOUT",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
