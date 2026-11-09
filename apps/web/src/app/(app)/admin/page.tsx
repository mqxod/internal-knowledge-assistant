"use client";

import { CheckCircle2, FileText, Loader2, Lock, Upload, XCircle } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/common/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityList } from "@/features/audit/components/activity-list";
import { AccessBadge, StatusBadge } from "@/features/documents/components/badges";
import { useDocumentStats } from "@/features/documents/hooks/use-documents";
import { relativeTime } from "@/lib/format";

export default function AdminOverviewPage() {
  const stats = useDocumentStats();
  const metrics = stats.data
    ? [
        { label: "Total documents", value: stats.data.total, icon: FileText, href: "/admin/documents" },
        { label: "Ready", value: stats.data.ready, icon: CheckCircle2, tone: "text-emerald-600" },
        { label: "Processing", value: stats.data.processing, icon: Loader2 },
        { label: "Failed", value: stats.data.failed, icon: XCircle, tone: stats.data.failed ? "text-red-600" : undefined },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Overview"
        description="The state of your company knowledge base."
        actions={<Button asChild size="sm"><Link href="/admin/upload"><Upload /> Upload document</Link></Button>}
      />
      {stats.isError ? (
        <ErrorState message={stats.error.message} onRetry={() => void stats.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.isPending
              ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)
              : metrics.map((m) => (
                  <div key={m.label} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      {m.label}
                      <m.icon className={`size-4 ${m.tone ?? ""}`} aria-hidden />
                    </div>
                    <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{m.value}</p>
                  </div>
                ))}
          </div>
          {stats.data && stats.data.adminOnly > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="size-3.5" aria-hidden /> {stats.data.adminOnly} document{stats.data.adminOnly === 1 ? " is" : "s are"} restricted to administrators.
            </p>
          )}
          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent uploads</CardTitle>
                <Button asChild variant="ghost" size="sm"><Link href="/admin/documents">View all</Link></Button>
              </CardHeader>
              <CardContent>
                {stats.isPending ? (
                  <Skeleton className="h-40" />
                ) : stats.data.recent.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No documents yet. Upload your first one to get started.</p>
                ) : (
                  <ul className="divide-y">
                    {stats.data.recent.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <Link href={`/admin/documents/${d.id}`} className="block truncate text-sm font-medium hover:underline">{d.title}</Link>
                          <span className="text-xs text-muted-foreground">{d.uploadedBy?.name ?? "Unknown"} · {relativeTime(d.createdAt)}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="hidden sm:inline-flex"><AccessBadge level={d.accessLevel} /></span>
                          <StatusBadge status={d.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
              <CardContent><ActivityList limit={8} /></CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
