"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import type { UserRole } from "@ika/shared";
import { getSignInAs, setSignInAs, subscribeSignInAs } from "@/lib/sign-in-as";

/** Current sign-in role choice ("member" during server render). */
export function useSignInAs(): UserRole {
  return useSyncExternalStore(subscribeSignInAs, getSignInAs, () => "member");
}

/** Switches the role for this session, drops cached data for the old role, and goes home. */
export function useSwitchSignInAs() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(
    (role: UserRole) => {
      setSignInAs(role);
      queryClient.clear();
      router.replace("/");
    },
    [queryClient, router],
  );
}
