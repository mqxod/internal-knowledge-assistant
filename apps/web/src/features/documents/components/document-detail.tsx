"use client";

import { AlertCircle, ArrowLeft, Check, Globe, Loader2, Lock, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useDocument, useUpdateDocument } from "../hooks/use-documents";
import { AccessBadge, INGESTION_ERRORS, StatusBadge } from "./badges";
import { DeleteDocumentDialog } from "./delete-document-dialog";

export function DocumentDetail({ id }: { id: string }) {
  const router = useRouter();
  const doc = useDocument(id);
  const update = useUpdateDocument();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (doc.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (doc.isError) return <ErrorState title="Couldn't load this document" message={doc.error.message} onRetry={() => void doc.refetch()} />;

  const d = doc.data;
  const save = (input: { title?: string; accessLevel?: "all" | "admin-only" }, msg: string) =>
    update.mutate({ id, input }, { onSuccess: () => { toast.success(msg); setEditing(false); }, onError: (e) => toast.error(errorMessage(e)) });

  return (
    <div className="space-y-6">
      <Link href="/admin/documents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Documents
      </Link>

      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          {editing ? (
            <form className="flex max-w-lg gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) save({ title: title.trim() }, "Title updated"); }}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus aria-label="Document title" />
              <Button type="submit" size="icon" disabled={update.isPending || !title.trim()} aria-label="Save title">{update.isPending ? <Loader2 className="animate-spin" /> : <Check />}</Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel"><X /></Button>
            </form>
          ) : (
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="truncate">{d.title}</span>
              {d.status !== "processing" && (
                <Button variant="ghost" size="icon-xs" onClick={() => { setTitle(d.title); setEditing(true); }} aria-label="Rename document"><Pencil /></Button>
              )}
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={d.status} /><AccessBadge level={d.accessLevel} /></div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={d.status === "processing" || update.isPending}
            onClick={() => save({ accessLevel: d.accessLevel === "all" ? "admin-only" : "all" }, d.accessLevel === "all" ? "Restricted to admins" : "Shared with everyone")}
          >
            {d.accessLevel === "all" ? <><Lock /> Make admin-only</> : <><Globe /> Share with everyone</>}
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" disabled={d.status === "processing"} onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>

      {d.status === "failed" && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertTitle>Processing failed{d.errorCode ? ` (${d.errorCode})` : ""}</AlertTitle>
          <AlertDescription>{INGESTION_ERRORS[d.errorCode ?? ""] ?? "The document could not be indexed. Delete it and upload again."}</AlertDescription>
        </Alert>
      )}

      <dl className="grid gap-4 rounded-xl border bg-card p-5 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["File", d.filename],
          ["Type", d.contentType === "markdown" ? "Markdown" : "Plain text"],
          ["Size", formatBytes(d.sizeBytes)],
          ["Sections", String(d.sectionCount)],
          ["Uploaded by", d.uploadedBy?.name ?? "—"],
          ["Uploaded", formatDateTime(d.createdAt)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0"><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 truncate font-medium" title={v}>{v}</dd></div>
        ))}
      </dl>

      <section aria-labelledby="sections-heading" className="space-y-3">
        <h2 id="sections-heading" className="text-sm font-semibold">Indexed sections</h2>
        {d.sections.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No sections are indexed for this document.</p>
        ) : (
          <ol className="space-y-2">
            {d.sections.map((s) => (
              <li key={s.id} id={`section-${s.id}`} className="scroll-mt-20 rounded-xl border bg-card target:ring-3 target:ring-ring/40">
                <details className="group" open={d.sections.length <= 3}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.sectionTitle}</span>
                      {s.headingPath.length > 1 && <span className="block truncate text-xs text-muted-foreground">{s.headingPath.join(" › ")}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">#{s.sectionIndex + 1} · {s.charCount} chars</span>
                  </summary>
                  <pre className="border-t px-4 py-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{s.content}</pre>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>

      <DeleteDocumentDialog
        document={confirmDelete ? { id: d.id, title: d.title } : null}
        onOpenChange={setConfirmDelete}
        onDeleted={() => router.push("/admin/documents")}
      />
    </div>
  );
}
