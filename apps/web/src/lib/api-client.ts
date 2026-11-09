import type { ApiResponse, ErrorCode, UsageSummary } from "@ika/shared";

export type ClientErrorCode = ErrorCode | "NETWORK_ERROR" | "UNKNOWN_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ClientErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly usage?: UsageSummary,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.code === "RATE_LIMITED";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type ApiClient = <T>(path: string, options?: RequestOptions) => Promise<T>;
export type TokenGetter = () => Promise<string | null>;

/**
 * All API calls go through here. The Clerk session token is fetched per request from the
 * Clerk SDK (kept in memory and refreshed by Clerk) and never persisted by the app.
 */
export function createApiClient(getToken: TokenGetter): ApiClient {
  return async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = await getToken();
    const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;

    let body: BodyInit | undefined;
    if (options.body instanceof FormData) body = options.body;
    else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    let res: Response;
    try {
      res = await fetch(`/api/v1${path}`, { method: options.method ?? "GET", headers, body, signal: options.signal });
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      throw new ApiError(0, "NETWORK_ERROR", "We couldn't reach the server. Check your connection and try again.");
    }

    let json: ApiResponse<T> | null = null;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      // Non-JSON responses (e.g. a proxy error page) are handled below.
    }

    if (json && json.success) return json.data;
    if (json && !json.success) {
      throw new ApiError(res.status, json.code ?? json.error?.code ?? "UNKNOWN_ERROR", json.message, json.error?.details, json.usage);
    }
    if (res.status === 413) throw new ApiError(413, "FILE_TOO_LARGE", "The file is too large.");
    if (res.status === 429) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please wait a moment.");
    throw new ApiError(res.status, "UNKNOWN_ERROR", "Something went wrong. Please try again.");
  };
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}
