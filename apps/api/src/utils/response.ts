import type { Response } from "express";
import type { ApiSuccess } from "@ika/shared";

export function sendSuccess<T>(res: Response, data: T, message = "OK", status = 200): void {
  const body: ApiSuccess<T> = { success: true, message, data };
  res.status(status).json(body);
}
