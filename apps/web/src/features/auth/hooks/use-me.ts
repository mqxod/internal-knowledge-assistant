"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/hooks/use-api-client";
import { queryKeys } from "@/lib/query-keys";
import { api } from "@/services/api";

export function useMe() {
  const client = useApiClient();
  const { isLoaded, isSignedIn } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.me(client),
    staleTime: 60_000,
    // Wait for Clerk to restore the session before asking the API who we are.
    enabled: isLoaded && !!isSignedIn,
  });
  return { ...query, isPending: !isLoaded || query.isPending, sessionMissing: isLoaded && !isSignedIn };
}
