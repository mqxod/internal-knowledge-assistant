"use client";

import { ShieldCheck, UserRound } from "lucide-react";
import type { UserRole } from "@ika/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { setSignInAs } from "@/lib/sign-in-as";
import { useSignInAs } from "../hooks/use-sign-in-as";

const HINTS: Record<UserRole, string> = {
  member: "Ask questions and get answers from company documents.",
  admin: "Only approved administrator emails get admin access.",
};

/** Member / Admin choice shown above Clerk's sign-in and sign-up forms. */
export function RoleChooser({ mode }: { mode: "sign-in" | "sign-up" }) {
  const role = useSignInAs();
  const choose = (value: string) => setSignInAs(value === "admin" ? "admin" : "member");

  return (
    <div className="w-full max-w-sm space-y-2">
      <p className="text-sm font-medium">{mode === "sign-in" ? "Sign in as" : "Sign up as"}</p>
      <Tabs value={role} onValueChange={choose}>
        <TabsList className="grid h-10 w-full grid-cols-2" aria-label="Choose your role">
          <TabsTrigger value="member" className="h-full">
            <UserRound aria-hidden /> Member
          </TabsTrigger>
          <TabsTrigger value="admin" className="h-full">
            <ShieldCheck aria-hidden /> Admin
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="text-xs text-muted-foreground" aria-live="polite">{HINTS[role]}</p>
    </div>
  );
}
