"use client";

import { AlertCircle, BookOpenText, Loader2, RotateCw, SearchX } from "lucide-react";
import { SafeMarkdown } from "@/components/common/safe-markdown";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useUsage } from "@/features/usage/hooks/use-usage";
import type { ChatMessage } from "../types";
import { SourceList } from "./source-list";

function AssistantAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
      <BookOpenText className="size-3.5" aria-hidden />
    </span>
  );
}

export function MessageItem({ message, onRetry, isAdmin }: { message: ChatMessage; onRetry: (id: string) => void; isAdmin: boolean }) {
  const usage = useUsage();

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-3" aria-live="polite">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {message.status === "pending" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Searching company documents and preparing an answer…
          </p>
        )}

        {message.status === "done" && message.found && (
          <div className="space-y-4">
            <SafeMarkdown>{message.answer ?? ""}</SafeMarkdown>
            {message.sources && message.sources.length > 0 && <SourceList sources={message.sources} linkToDocuments={isAdmin} />}
          </div>
        )}

        {message.status === "done" && !message.found && (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <SearchX className="size-4 text-muted-foreground" aria-hidden /> No answer found in the documents
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">{message.answer}</p>
          </div>
        )}

        {message.status === "error" && message.error && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="size-4" aria-hidden />
              {message.error.code === "MONTHLY_LIMIT_REACHED" ? "Monthly limit reached" : "Couldn't get an answer"}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {message.error.message}
              {message.error.code === "MONTHLY_LIMIT_REACHED" && usage.data && ` Your quota resets on ${formatDate(usage.data.resetsAt)}.`}
            </p>
            {message.error.retryable && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => onRetry(message.id)}>
                <RotateCw /> Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
