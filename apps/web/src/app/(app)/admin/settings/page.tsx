"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityList } from "@/features/audit/components/activity-list";
import { useMe } from "@/features/auth/hooks/use-me";
import { InviteUserDialog } from "@/features/users/components/invite-user-dialog";
import { UsersTable } from "@/features/users/components/users-table";
import { formatBytes } from "@/lib/format";

export default function SettingsPage() {
  const me = useMe();
  const cfg = me.data?.config;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <PageHeader title="Settings" description="Manage who can use the assistant and review workspace limits." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">People</CardTitle>
              <CardDescription>Only people added here can access company documents. Disabled accounts are blocked immediately.</CardDescription>
            </div>
            <InviteUserDialog />
          </CardHeader>
          <CardContent><UsersTable /></CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Limits</CardTitle>
              <CardDescription>Configured on the server through environment variables.</CardDescription>
            </CardHeader>
            <CardContent>
              {cfg && (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Questions per user / month</dt><dd className="font-medium tabular-nums">{cfg.monthlyQueryLimit}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Max question length</dt><dd className="font-medium tabular-nums">{cfg.maxQuestionLength} chars</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Max upload size</dt><dd className="font-medium tabular-nums">{formatBytes(cfg.maxUploadSizeBytes)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">File types</dt><dd className="font-medium">{cfg.allowedExtensions.join(" ")}</dd></div>
                </dl>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Audit log</CardTitle></CardHeader>
            <CardContent><ActivityList limit={15} /></CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
