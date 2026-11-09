import type { LucideIcon } from "lucide-react";
import { BarChart3, FileText, Gauge, MessageSquareText, Settings, Upload, UserRound } from "lucide-react";
import type { UserRole } from "@ika/shared";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

/** UX only: hiding items is not security. The API authorizes every request. */
export const NAV: Record<UserRole, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Overview", icon: Gauge, exact: true },
    { href: "/assistant", label: "Ask Assistant", icon: MessageSquareText },
    { href: "/admin/documents", label: "Documents", icon: FileText },
    { href: "/admin/upload", label: "Upload Document", icon: Upload },
    { href: "/usage", label: "Usage", icon: BarChart3 },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ],
  member: [
    { href: "/assistant", label: "Ask Assistant", icon: MessageSquareText },
    { href: "/usage", label: "Usage", icon: BarChart3 },
    { href: "/profile", label: "Profile", icon: UserRound },
  ],
};

export function homeFor(role: UserRole): string {
  return role === "admin" ? "/admin" : "/assistant";
}
