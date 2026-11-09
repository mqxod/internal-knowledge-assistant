"use client";

import { CalendarClock, CircleHelp, Gauge } from "lucide-react";
import { ErrorState } from "@/components/common/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsage } from "@/features/usage/hooks/use-usage";
import { formatDate } from "@/lib/format";

export default function UsagePage() {
  const { data, isPending, isError, error, refetch } = useUsage();
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <PageHeader title="Usage" description="Your monthly question allowance. Usage is tracked per calendar month (UTC)." />
      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>This month</CardTitle>
              <CardDescription>
                {data.remaining === 0 ? "You've reached your limit for this month." : `You can ask ${data.remaining} more question${data.remaining === 1 ? "" : "s"} this month.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tabular-nums tracking-tight">{data.used}</span>
                <span className="text-muted-foreground">/ {data.limit} questions used</span>
              </div>
              <Progress value={Math.min(100, (data.used / data.limit) * 100)} className="h-2" aria-label="Monthly usage" />
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat icon={Gauge} label="Remaining" value={String(data.remaining)} />
            <Stat icon={CalendarClock} label="Resets on" value={formatDate(data.resetsAt)} />
            <Stat icon={CircleHelp} label="Monthly limit" value={String(data.limit)} />
          </div>
          <p className="text-sm text-muted-foreground">
            Every completed question counts — including ones where the assistant couldn&apos;t find an answer. Questions that fail because of a system error are not counted.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {label}
      </div>
      <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
