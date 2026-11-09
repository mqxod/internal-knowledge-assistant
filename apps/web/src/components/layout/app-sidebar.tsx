"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText } from "lucide-react";
import type { UserDTO } from "@ika/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UsageMeter } from "@/features/usage/components/usage-meter";
import { NAV } from "./nav-config";
import { UserMenu } from "./user-menu";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md px-2 py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <BookOpenText className="size-4" aria-hidden />
      </span>
      <span className="text-sm font-semibold tracking-tight">Knowledge Assistant</span>
    </Link>
  );
}

export function SidebarContent({ user, onNavigate }: { user: UserDTO; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV[user.role];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-3">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 px-3 py-2">
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">
          {user.role === "admin" ? "Workspace" : "Menu"}
        </p>
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-3 border-t p-3">
        <UsageMeter compact />
        <div className="flex items-center justify-between gap-2">
          <UserMenu user={user} />
          {user.role === "admin" && <Badge variant="secondary">Admin</Badge>}
        </div>
      </div>
    </div>
  );
}
