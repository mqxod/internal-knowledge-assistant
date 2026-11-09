"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateUserInput, UpdateUserInput } from "@ika/shared";
import { useApiClient } from "@/hooks/use-api-client";
import { queryKeys } from "@/lib/query-keys";
import { api } from "@/services/api";

export function useUsers(search: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.users.list({ search }),
    queryFn: () => api.users.list(client, { search: search || undefined, pageSize: 100 }),
    placeholderData: keepPreviousData,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.users.all }), qc.invalidateQueries({ queryKey: queryKeys.audit })]);
}

export function useCreateUser() {
  const client = useApiClient();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: CreateUserInput) => api.users.create(client, input), onSuccess: invalidate });
}

export function useUpdateUser() {
  const client = useApiClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; input: UpdateUserInput }) => api.users.update(client, v.id, v.input),
    onSuccess: invalidate,
  });
}
