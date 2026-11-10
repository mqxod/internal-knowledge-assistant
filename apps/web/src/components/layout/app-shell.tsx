"use client";

import { RedirectToSignIn, useClerk } from "@clerk/nextjs";
import { Loader2, LogOut, Menu, ShieldAlert, ShieldOff, UserRound, UserX } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMe } from "@/features/auth/hooks/use-me";
import { ApiError } from "@/lib/api-client";
import { useSignInAs, useSwitchSignInAs } from "@/features/auth/hooks/use-sign-in-as";
import { Brand, SidebarContent } from "./app-sidebar";
import { ThemeToggle } from "./theme-toggle";

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6">{children}</div>;
}

function AccountBlocked({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: typeof UserX;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  const { signOut } = useClerk();
  return (
    <FullScreen>
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {action}
        <Button variant="outline" className={action ? "mt-2 w-full" : "mt-6 w-full"} onClick={() => void signOut({ redirectUrl: "/sign-in" })}>
          <LogOut /> Sign out
        </Button>
      </div>
    </FullScreen>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const signInAs = useSignInAs();
  const switchSignInAs = useSwitchSignInAs();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (me.sessionMissing) return <RedirectToSignIn />;

  if (me.isPending) {
    return (
      <FullScreen>
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading your workspace" />
      </FullScreen>
    );
  }

  if (me.isError) {
    const err = me.error;
    if (err instanceof ApiError && err.code === "UNAUTHORIZED") return <RedirectToSignIn />;
    if (err instanceof ApiError && err.code === "ACCOUNT_NOT_PROVISIONED") {
      return <AccountBlocked icon={UserX} title="Account setup incomplete" message="Your sign-in worked, but we couldn't set up your account. Make sure your email address is verified, or ask an administrator for help." />;
    }
    if (err instanceof ApiError && err.code === "ACCOUNT_DISABLED") {
      return <AccountBlocked icon={ShieldOff} title="Account disabled" message="Your access to the knowledge assistant has been disabled. Contact your administrator if you think this is a mistake." />;
    }
    return (
      <FullScreen>
        <ErrorState title="Couldn't load your workspace" message={err.message} onRetry={() => void me.refetch()} />
      </FullScreen>
    );
  }

  if (!me.data) return null;
  const { user, adminEligible } = me.data;

  if (signInAs === "admin" && !adminEligible) {
    return (
      <AccountBlocked
        icon={ShieldAlert}
        title="Not an administrator"
        message={`${user.email} doesn't have admin access. Ask an existing administrator to grant it, or continue as a member.`}
        action={
          <Button className="mt-6 w-full" onClick={() => switchSignInAs("member")}>
            <UserRound /> Continue as member
          </Button>
        }
      />
    );
  }
  const forbidden = pathname.startsWith("/admin") && user.role !== "admin";

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-sidebar lg:block">
        <SidebarContent user={user} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur lg:justify-end">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent user={user} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1">
          {forbidden ? (
            <ErrorState className="py-24" title="Admins only" message="You don't have permission to view this page." />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
