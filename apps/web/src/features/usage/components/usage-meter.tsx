"use client";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUsage } from "../hooks/use-usage";

export function UsageMeter({ compact = false }: { compact?: boolean }) {
  const { data, isPending, isError } = useUsage();
  if (isPending) return <Skeleton className="h-10 w-full" />;
  if (isError || !data) return null;

  const pct = Math.min(100, Math.round((data.used / data.limit) * 100));
  const exhausted = data.remaining === 0;
  const low = !exhausted && data.remaining <= Math.max(5, data.limit * 0.1);

  return (
    <div className={cn("space-y-1.5", !compact && "rounded-lg border p-4")}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">
          {data.used} / {data.limit} questions used
        </span>
        <span className={cn("text-muted-foreground", exhausted && "text-destructive", low && "text-amber-600 dark:text-amber-500")}>
          {data.remaining} left
        </span>
      </div>
      <Progress
        value={pct}
        aria-label={`${data.used} of ${data.limit} monthly questions used`}
        className={cn("h-1.5", exhausted && "[&>*]:bg-destructive", low && "[&>*]:bg-amber-500")}
      />
      <p className="text-xs text-muted-foreground">Resets {formatDate(data.resetsAt)}</p>
    </div>
  );
}
