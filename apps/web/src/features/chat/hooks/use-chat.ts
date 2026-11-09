"use client";

import { useCallback, useState } from "react";
import { useApiClient } from "@/hooks/use-api-client";
import { ApiError } from "@/lib/api-client";
import { api } from "@/services/api";
import { useSetUsage } from "@/features/usage/hooks/use-usage";
import type { AssistantMessage, ChatMessage } from "../types";

const newKey = () => crypto.randomUUID().replace(/-/g, "");

/**
 * Conversation state lives in the browser for this session only. Each question is answered
 * independently (no conversation memory is sent to the model).
 */
export function useChat() {
  const client = useApiClient();
  const setUsage = useSetUsage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const patch = useCallback((id: string, update: Partial<AssistantMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id && m.role === "assistant" ? { ...m, ...update } : m)));
  }, []);

  const run = useCallback(
    async (msg: AssistantMessage) => {
      try {
        const res = await api.ask(client, msg.question, msg.idempotencyKey);
        setUsage(res.usage);
        patch(msg.id, { status: "done", answer: res.answer, found: res.found, sources: res.sources, error: undefined });
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError(0, "UNKNOWN_ERROR", "Something went wrong. Please try again.");
        if (e.usage) setUsage(e.usage);
        const retryable = e.retryable || e.code === "AI_PROVIDER_ERROR" || e.code === "AI_TIMEOUT" || e.code === "REQUEST_IN_PROGRESS";
        patch(msg.id, { status: "error", error: { code: e.code, message: e.message, retryable } });
      }
    },
    [client, patch, setUsage],
  );

  const ask = useCallback(
    (question: string) => {
      const assistant: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        question,
        idempotencyKey: newKey(),
        status: "pending",
      };
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: question }, assistant]);
      void run(assistant);
    },
    [run],
  );

  const retry = useCallback(
    (id: string) => {
      const msg = messages.find((m): m is AssistantMessage => m.id === id && m.role === "assistant");
      if (!msg) return;
      patch(id, { status: "pending", error: undefined });
      void run({ ...msg, status: "pending" });
    },
    [messages, patch, run],
  );

  const pending = messages.some((m) => m.role === "assistant" && m.status === "pending");
  return { messages, ask, retry, pending, clear: () => setMessages([]) };
}
