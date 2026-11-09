"use client";

import { MoreHorizontal, Search, ShieldCheck, ShieldOff, UserCheck, UserMinus, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import type { UserDTO } from "@ika/shared";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/features/auth/hooks/use-me";
import { errorMessage } from "@/lib/api-client";
import { useUpdateUser, useUsers } from "../hooks/use-users";

export function UsersTable() {
  const me = useMe();
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  const users = useUsers(deferred);
  const update = useUpdateUser();

  const change = (u: UserDTO, input: { role?: UserDTO["role"]; status?: UserDTO["status"] }, msg: string) =>
    update.mutate({ id: u.id, input }, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e)) });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" aria-label="Search people" className="pl-8" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {users.isError ? (
          <ErrorState message={users.error.message} onRetry={() => void users.refetch()} />
        ) : users.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : users.data.items.length === 0 ? (
          <EmptyState icon={Users} title="No people found" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.items.map((u) => {
                const self = u.id === me.data?.user.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="pl-4">
                      <span className="block font-medium">{u.name}{self && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
                      <span className="block text-xs text-muted-foreground">{u.email}</span>
                    </TableCell>
                    <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">{u.role}</Badge></TableCell>
                    <TableCell>
                      {u.status === "disabled" ? (
                        <Badge variant="destructive">Disabled</Badge>
                      ) : u.linked ? (
                        <Badge variant="outline">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Invited</Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      {!self && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`} disabled={update.isPending}><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {u.role === "member" ? (
                              <DropdownMenuItem onSelect={() => change(u, { role: "admin" }, `${u.name} is now an admin`)}><ShieldCheck /> Make admin</DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => change(u, { role: "member" }, `${u.name} is now a member`)}><ShieldOff /> Make member</DropdownMenuItem>
                            )}
                            {u.status === "active" ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => change(u, { status: "disabled" }, `${u.name} has been disabled`)}><UserMinus /> Disable access</DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => change(u, { status: "active" }, `${u.name} has been re-enabled`)}><UserCheck /> Enable access</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
