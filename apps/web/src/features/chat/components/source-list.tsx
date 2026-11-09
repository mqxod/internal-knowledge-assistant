"use client";

import { ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import type { SourceDTO } from "@ika/shared";

export function SourceList({ sources, linkToDocuments }: { sources: SourceDTO[]; linkToDocuments: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Sources</p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {sources.map((s, i) => (
          <li key={s.sectionId}>
            <details className="group rounded-lg border bg-background text-sm open:shadow-xs">
              <summary className="flex cursor-pointer list-none items-start gap-2.5 p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-medium tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate font-medium">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{s.documentTitle}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{s.sectionTitle}</span>
                </span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
              </summary>
              <div className="space-y-2 border-t px-3 py-2.5">
                <p className="text-xs leading-relaxed text-muted-foreground">{s.excerpt}</p>
                {linkToDocuments && (
                  <Link href={`/admin/documents/${s.documentId}#section-${s.sectionId}`} className="text-xs font-medium underline underline-offset-4">
                    Open document
                  </Link>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
