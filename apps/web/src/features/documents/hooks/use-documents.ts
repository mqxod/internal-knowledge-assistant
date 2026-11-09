"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccessLevel, ListDocumentsQuery, UpdateDocumentInput } from "@ika/shared";
import { useApiClient } from "@/hooks/use-api-client";
import { queryKeys } from "@/lib/query-keys";
import { api } from "@/services/api";

export function useDocuments(q: Partial<ListDocumentsQuery>) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.documents.list(q),
    queryFn: () => api.documents.list(client, q),
    placeholderData: keepPreviousData,
    // Keep polling while anything is still processing so status is live.
    refetchInterval: (query) => (query.state.data?.items.some((d) => d.status === "processing") ? 3000 : false),
  });
}

export function useDocumentStats() {
  const client = useApiClient();
  return useQuery({ queryKey: queryKeys.documents.stats, queryFn: () => api.documents.stats(client) });
}

export function useDocument(id: string) {
  const client = useApiClient();
  return useQuery({ queryKey: queryKeys.documents.detail(id), queryFn: () => api.documents.get(client, id) });
}

function useInvalidateDocuments() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.documents.all }), qc.invalidateQueries({ queryKey: queryKeys.audit })]);
}

export function useUploadDocument() {
  const client = useApiClient();
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (v: { file: File; accessLevel: AccessLevel; title?: string }) => api.documents.upload(client, v.file, v.accessLevel, v.title),
    onSettled: invalidate, // a failed ingestion still creates a "failed" record worth showing
  });
}

export function useUpdateDocument() {
  const client = useApiClient();
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (v: { id: string; input: UpdateDocumentInput }) => api.documents.update(client, v.id, v.input),
    onSuccess: invalidate,
  });
}

export function useDeleteDocument() {
  const client = useApiClient();
  const invalidate = useInvalidateDocuments();
  return useMutation({ mutationFn: (id: string) => api.documents.remove(client, id), onSuccess: invalidate });
}
