"use client";

import { Ban, BookOpenText, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/hooks/use-me";
import { useUsage } from "@/features/usage/hooks/use-usage";
import { formatDate } from "@/lib/format";
import { useChat } from "../hooks/use-chat";
import { ChatComposer } from "./chat-composer";
import { MessageItem } from "./message-item";

const SUGGESTIONS = [
  "How many annual leave days do employees get?",
  "What should I do if I'm sick?",
  "What are the password requirements?",
  "How do I roll back a production deployment?",
];

export function ChatView() {
  const me = useMe();
  const usage = useUsage();
  const { messages, ask, retry, pending, clear } = useChat();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const limitReached = usage.data?.remaining === 0;
  const maxLength = me.data?.config.maxQuestionLength ?? 1000;
  const isAdmin = me.data?.user.role === "admin";
  const firstName = me.data?.user.name.split(" ")[0];

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 lg:px-6">
      <div className="flex-1 overflow-y-auto py-8">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center">
            <div className="mb-8 space-y-2">
              <span className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
                <BookOpenText className="size-5" aria-hidden />
              </span>
              <h1 className="pt-2 text-2xl font-semibold tracking-tight">
                {firstName ? `Hi ${firstName}, what would you like to know?` : "What would you like to know?"}
              </h1>
              <p className="max-w-xl text-sm text-muted-foreground">
                Ask about company policies, the employee handbook, or engineering runbooks. Answers come only from{" "}
                {isAdmin ? "all company documents, including admin-only ones" : "documents shared with you"}, with sources you can open and check.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={limitReached || pending}
                  onClick={() => ask(q)}
                  className="rounded-lg border bg-background p-3 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((m) => (
              <MessageItem key={m.id} message={m} onRetry={retry} isAdmin={isAdmin} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="space-y-3 border-t bg-background py-4">
        {limitReached && usage.data && (
          <Alert variant="destructive">
            <Ban aria-hidden />
            <AlertTitle>You&apos;ve reached your monthly question limit</AlertTitle>
            <AlertDescription>
              You&apos;ve used all {usage.data.limit} questions for this month. You can ask again from {formatDate(usage.data.resetsAt)}.
            </AlertDescription>
          </Alert>
        )}
        <ChatComposer
          onSubmit={ask}
          busy={pending}
          disabled={limitReached}
          maxLength={maxLength}
          disabledReason={limitReached ? "Monthly limit reached" : undefined}
        />
        {messages.length > 0 && !pending && (
          <div className="flex justify-end">
            <Button variant="ghost" size="xs" onClick={clear}>
              <RotateCcw /> New conversation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
