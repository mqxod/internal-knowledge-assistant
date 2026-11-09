"use client";

import { UserProfile } from "@clerk/nextjs";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { useMe } from "@/features/auth/hooks/use-me";
import { formatDate } from "@/lib/format";

export default function ProfilePage() {
  const me = useMe();
  const user = me.data?.user;
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <PageHeader title="Profile" description="Your account details and sign-in security." />
      {user && (
        <dl className="grid gap-4 rounded-xl border bg-card p-5 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Name</dt><dd className="mt-1 font-medium">{user.name}</dd></div>
          <div><dt className="text-muted-foreground">Email</dt><dd className="mt-1 truncate font-medium">{user.email}</dd></div>
          <div><dt className="text-muted-foreground">Role</dt><dd className="mt-1"><Badge variant="secondary" className="capitalize">{user.role}</Badge></dd></div>
          <div><dt className="text-muted-foreground">Member since</dt><dd className="mt-1 font-medium">{formatDate(user.createdAt)}</dd></div>
        </dl>
      )}
      <p className="text-sm text-muted-foreground">
        Manage your password and multi-factor authentication below. {user?.role === "admin" && "Administrators should keep MFA enabled."}
      </p>
      <UserProfile routing="hash" appearance={{ elements: { rootBox: "w-full", cardBox: "w-full max-w-none shadow-none border rounded-xl" } }} />
    </div>
  );
}
