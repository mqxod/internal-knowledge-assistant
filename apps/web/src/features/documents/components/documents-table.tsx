"use client";

import { ChevronLeft, ChevronRight, FileText, MoreHorizontal, Search, Trash2, Eye, Lock, Globe, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import type { AccessLevel, DocumentDTO, DocumentStatus } from "@ika/shared";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useDocuments, useUpdateDocument } from "../hooks/use-documents";
import { AccessBadge, StatusBadge } from "./badges";
import { DeleteDocumentDialog } from "./delete-document-dialog";

const PAGE_SIZE = 10;
type Filter<T> = T | "any";

export function DocumentsTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Filter<DocumentStatus>>("any");
  const [access, setAccess] = useState<Filter<AccessLevel>>("any");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<DocumentDTO | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const update = useUpdateDocument();

  const query = useDocuments({
    page,
    pageSize: PAGE_SIZE,
    search: deferredSearch || undefined,
    status: status === "any" ? undefined : status,
    accessLevel: access === "any" ? undefined : access,
  });
  const filtered = !!deferredSearch || status !== "any" || access !== "any";

  const toggleAccess = (d: DocumentDTO) => {
    const next: AccessLevel = d.accessLevel === "all" ? "admin-only" : "all";
    update.mutate(
      { id: d.id, input: { accessLevel: next } },
      {
        onSuccess: () => toast.success(next === "admin-only" ? `“${d.title}” is now admin-only` : `“${d.title}” is now available to everyone`),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title or filename"
            aria-label="Search documents"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v as Filter<DocumentStatus>); setPage(1); }}>
          <SelectTrigger className="sm:w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All statuses</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={access} onValueChange={(v) => { setAccess(v as Filter<AccessLevel>); setPage(1); }}>
          <SelectTrigger className="sm:w-40" aria-label="Filter by access level"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All access levels</SelectItem>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="admin-only">Admin only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : query.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : query.data.items.length === 0 ? (
          filtered ? (
            <EmptyState icon={Search} title="No matching documents" description="Try a different search or clear the filters." />
          ) : (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Upload Markdown or text files to start answering questions."
              action={<Button asChild size="sm"><Link href="/admin/upload"><Upload /> Upload document</Link></Button>}
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Document</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="hidden lg:table-cell">Uploaded</TableHead>
                <TableHead className="hidden lg:table-cell">Uploaded by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-[18rem] pl-4">
                    <Link href={`/admin/documents/${d.id}`} className="block truncate font-medium hover:underline">{d.title}</Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {d.filename}{d.status === "ready" && ` · ${d.sectionCount} sections`}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{d.contentType === "markdown" ? "Markdown" : "Text"}</TableCell>
                  <TableCell><AccessBadge level={d.accessLevel} /></TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDate(d.createdAt)}</TableCell>
                  <TableCell className="hidden max-w-[10rem] truncate text-muted-foreground lg:table-cell">{d.uploadedBy?.name ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.title}`}><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => router.push(`/admin/documents/${d.id}`)}><Eye /> View details</DropdownMenuItem>
                        <DropdownMenuItem disabled={d.status === "processing" || update.isPending} onSelect={() => toggleAccess(d)}>
                          {d.accessLevel === "all" ? <><Lock /> Make admin-only</> : <><Globe /> Share with everyone</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" disabled={d.status === "processing"} onSelect={() => setToDelete(d)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {query.data && query.data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {query.data.total} document{query.data.total === 1 ? "" : "s"} · Page {query.data.page} of {query.data.totalPages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= query.data.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <DeleteDocumentDialog document={toDelete} onOpenChange={(o) => !o && setToDelete(null)} />
    </div>
  );
}
