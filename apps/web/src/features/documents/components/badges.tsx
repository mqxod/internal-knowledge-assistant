import { CheckCircle2, Globe, Loader2, Lock, XCircle } from "lucide-react";
import type { AccessLevel, DocumentStatus } from "@ika/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS: Record<DocumentStatus, { label: string; className: string; icon: typeof Loader2 }> = {
  processing: { label: "Processing", className: "border-border bg-muted text-muted-foreground", icon: Loader2 },
  ready: { label: "Ready", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400", icon: CheckCircle2 },
  failed: { label: "Failed", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400", icon: XCircle },
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const s = STATUS[status];
  return (
    <Badge variant="outline" className={cn("gap-1", s.className)}>
      <s.icon className={cn(status === "processing" && "animate-spin")} aria-hidden />
      {s.label}
    </Badge>
  );
}

export function AccessBadge({ level }: { level: AccessLevel }) {
  return level === "admin-only" ? (
    <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
      <Lock aria-hidden /> Admin only
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Globe aria-hidden /> Everyone
    </Badge>
  );
}

/** Human-readable explanations for ingestion error codes (never raw exceptions). */
export const INGESTION_ERRORS: Record<string, string> = {
  TOO_MANY_SECTIONS: "The document has too many sections to index. Split it into smaller files.",
  EMPTY_DOCUMENT: "No indexable text was found in the document.",
  PROCESSING_INTERRUPTED: "Processing was interrupted (for example by a server restart). Delete it and upload again.",
  PROCESSING_ERROR: "An unexpected error occurred while indexing. Delete it and try again.",
};
