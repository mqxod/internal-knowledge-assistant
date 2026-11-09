"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UsageSummary } from "@ika/shared";
import { useApiClient } from "@/hooks/use-api-client";
import { queryKeys } from "@/lib/query-keys";
import { api } from "@/services/api";

export function useUsage() {
  const client = useApiClient();
  return useQuery({ queryKey: queryKeys.usage, queryFn: () => api.usage(client) });
}

/** The backend returns authoritative usage with every answer/limit error; keep the cache in sync. */
export function useSetUsage() {
  const qc = useQueryClient();
  return (usage: UsageSummary) => qc.setQueryData(queryKeys.usage, usage);
}
