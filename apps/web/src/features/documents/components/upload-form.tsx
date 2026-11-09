"use client";

import { CheckCircle2, FileText, Globe, Loader2, Lock, UploadCloud, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import type { AccessLevel, DocumentDTO } from "@ika/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/features/auth/hooks/use-me";
import { ApiError, errorMessage } from "@/lib/api-client";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUploadDocument } from "../hooks/use-documents";

const ACCESS_OPTIONS: { value: AccessLevel; title: string; text: string; icon: typeof Globe }[] = [
  { value: "all", title: "Everyone", text: "All employees can get answers from this document.", icon: Globe },
  { value: "admin-only", title: "Admin only", text: "Only administrators' questions will search it.", icon: Lock },
];

export function UploadForm() {
  const me = useMe();
  const upload = useUploadDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [access, setAccess] = useState<AccessLevel>("all");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ ok: true; doc: DocumentDTO } | { ok: false; message: string; documentId?: string } | null>(null);

  const maxBytes = me.data?.config.maxUploadSizeBytes ?? 2 * 1024 * 1024;
  const allowed = me.data?.config.allowedExtensions ?? [".md", ".markdown", ".txt"];

  const pick = (f: File | undefined) => {
    setResult(null);
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      setFile(null);
      setFileError(`Unsupported file type. Upload ${allowed.join(", ")} files.`);
      return;
    }
    if (f.size > maxBytes) {
      setFile(null);
      setFileError(`This file is ${formatBytes(f.size)}. The maximum is ${formatBytes(maxBytes)}.`);
      return;
    }
    if (f.size === 0) {
      setFile(null);
      setFileError("This file is empty.");
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (upload.isPending) return;
    pick(e.dataTransfer.files[0]);
  };

  const reset = () => {
    setFile(null);
    setTitle("");
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = () => {
    if (!file || upload.isPending) return; // guards against double submission
    upload.mutate(
      { file, accessLevel: access, title: title.trim() || undefined },
      {
        onSuccess: (doc) => {
          setResult({ ok: true, doc });
          toast.success(`“${doc.title}” is ready — ${doc.sectionCount} sections indexed`);
          reset();
        },
        onError: (err) => {
          const documentId =
            err instanceof ApiError && err.details && typeof err.details === "object" && "documentId" in err.details
              ? String((err.details as { documentId: unknown }).documentId)
              : undefined;
          setResult({ ok: false, message: errorMessage(err), documentId });
          toast.error(errorMessage(err));
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative rounded-xl border-2 border-dashed bg-card p-8 text-center transition-colors",
          dragging ? "border-primary bg-accent/50" : "border-border",
          fileError && "border-destructive/50",
        )}
      >
        <input
          ref={inputRef}
          id="file"
          type="file"
          accept={allowed.join(",")}
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
          disabled={upload.isPending}
        />
        {file ? (
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-background p-3 text-left">
            <FileText className="size-8 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={reset} disabled={upload.isPending} aria-label="Remove file">
              <X />
            </Button>
          </div>
        ) : (
          <>
            <UploadCloud className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium">Drag and drop a file here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Markdown or plain text · up to {formatBytes(maxBytes)}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
          </>
        )}
        {fileError && <p role="alert" className="mt-3 text-sm text-destructive">{fileError}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Defaults to the document's first heading" disabled={upload.isPending} />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Who can get answers from this document?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCESS_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                access === o.value ? "border-primary bg-accent/40" : "hover:bg-accent/30",
              )}
            >
              <input type="radio" name="access" value={o.value} checked={access === o.value} onChange={() => setAccess(o.value)} className="sr-only" disabled={upload.isPending} />
              <o.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="block text-sm font-medium">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={!file || upload.isPending}>
          {upload.isPending ? <><Loader2 className="animate-spin" /> Processing…</> : <><UploadCloud /> Upload and index</>}
        </Button>
        {upload.isPending && <span className="text-sm text-muted-foreground">Validating, splitting into sections and indexing…</span>}
      </div>

      {result?.ok && (
        <Alert>
          <CheckCircle2 className="text-emerald-600" aria-hidden />
          <AlertTitle>“{result.doc.title}” is ready</AlertTitle>
          <AlertDescription>
            {result.doc.sectionCount} sections indexed.{" "}
            <Link className="font-medium underline underline-offset-4" href={`/admin/documents/${result.doc.id}`}>View document</Link>
          </AlertDescription>
        </Alert>
      )}
      {result && !result.ok && (
        <Alert variant="destructive">
          <XCircle aria-hidden />
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription>
            {result.message}
            {result.documentId && (
              <> <Link className="font-medium underline underline-offset-4" href={`/admin/documents/${result.documentId}`}>View failed document</Link></>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
