"use client";

import { ArrowUp } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChatComposer({
  onSubmit,
  disabled,
  busy,
  maxLength,
  disabledReason,
}: {
  onSubmit: (question: string) => void;
  disabled: boolean;
  busy: boolean;
  maxLength: number;
  disabledReason?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const tooLong = value.length > maxLength;
  const tooShort = trimmed.length > 0 && trimmed.length < 3;
  const canSend = !disabled && !busy && trimmed.length >= 3 && !tooLong;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    onSubmit(trimmed);
    setValue("");
    requestAnimationFrame(() => ref.current?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border bg-background p-2 shadow-xs transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
          disabled && "opacity-60",
          tooLong && "border-destructive",
        )}
      >
        <label htmlFor="question" className="sr-only">Ask a question</label>
        <textarea
          id="question"
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={disabledReason ?? "Ask about policies, procedures or runbooks…"}
          aria-invalid={tooLong || undefined}
          aria-describedby="composer-hint"
          className="field-sizing-content max-h-48 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <Button type="submit" size="icon" disabled={!canSend} aria-label="Send question">
          <ArrowUp />
        </Button>
      </div>
      <div id="composer-hint" className="flex justify-between px-1 text-xs text-muted-foreground">
        <span>
          {tooLong ? (
            <span className="text-destructive">Questions can be up to {maxLength} characters.</span>
          ) : tooShort ? (
            "Questions need at least 3 characters."
          ) : (
            <>
              <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift + Enter</kbd> for a new line
            </>
          )}
        </span>
        {value.length > maxLength * 0.8 && <span className={cn("tabular-nums", tooLong && "text-destructive")}>{value.length}/{maxLength}</span>}
      </div>
    </form>
  );
}
