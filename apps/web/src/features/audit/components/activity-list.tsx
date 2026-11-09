"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import type { AuditLogDTO } from "@ika/shared";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiClient } from "@/hooks/use-api-client";
import { relativeTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { api } from "@/services/api";

function describe(e: AuditLogDTO): string {
  const m = e.metadata as Record<string, string | number | undefined>;
  switch (e.action) {
    case "document.upload": return `uploaded “${m.title}” (${m.sections} sections)`;
    case "document.upload_failed": return `upload failed (${m.code})`;
    case "document.update": return `updated a document${m.accessLevel ? ` → ${m.accessLevel === "all" ? "everyone" : "admin-only"}` : ""}${m.title ? ` → “${m.title}”` : ""}`;
    case "document.delete": return `deleted “${m.title}”`;
    case "user.create": return `added a ${m.role}`;
    case "user.role_change": return `changed a role ${m.from} → ${m.to}`;
    case "user.status_change": return `${m.to === "disabled" ? "disabled" : "re-enabled"} a user`;
    case "user.bootstrap_admin": return "bootstrapped an administrator";
    case "user.linked": return "signed in for the first time";
    case "user.self_provisioned": return "joined as a member";
    default: return e.action;
  }
}

export function ActivityList({ limit = 10 }: { limit?: number }) {
  const client = useApiClient();
  const q = useQuery({ queryKey: [...queryKeys.audit, limit], queryFn: () => api.audit(client, limit) });
  if (q.isPending) return <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-5" />)}</div>;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) return <EmptyState icon={Activity} title="No activity yet" className="py-8" />;
  return (
    <ul className="space-y-3">
      {q.data.map((e) => (
        <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="font-medium">{e.actor?.name ?? "System"}</span>{" "}
            <span className="text-muted-foreground">{describe(e)}</span>
          </span>
          <time className="shrink-0 text-xs text-muted-foreground" dateTime={e.createdAt}>{relativeTime(e.createdAt)}</time>
        </li>
      ))}
    </ul>
  );
}
