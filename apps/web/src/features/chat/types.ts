import type { SourceDTO } from "@ika/shared";
import type { ClientErrorCode } from "@/lib/api-client";

export interface UserMessage {
  id: string;
  role: "user";
  content: string;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  question: string;
  /** Reused on retry so a repeated request is never double-counted. */
  idempotencyKey: string;
  status: "pending" | "done" | "error";
  answer?: string;
  found?: boolean;
  sources?: SourceDTO[];
  error?: { code: ClientErrorCode; message: string; retryable: boolean };
}

export type ChatMessage = UserMessage | AssistantMessage;
