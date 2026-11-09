"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor } from "@/components/layout/nav-config";
import { useMe } from "@/features/auth/hooks/use-me";

/** Sends each role to its home screen. */
export default function HomeRedirect() {
  const router = useRouter();
  const me = useMe();
  const role = me.data?.user.role;
  useEffect(() => {
    if (role) router.replace(homeFor(role));
  }, [role, router]);
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}
