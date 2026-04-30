"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import {
  CalendarDays,
  Compass,
  FileText,
  Home,
  MessageSquare,
  Settings,
  ShieldCheck,
  Wallet,
  Wand2,
  Users,
  Briefcase,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";

interface SidebarProps {
  role: UserRole;
}

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  // Optional: list of additional path prefixes that should still highlight
  // this link as active. Used so /dashboard/client/event/[id] keeps "My
  // events" lit even though the URL has more segments than the nav href.
  match?: string[];
}

const roleLinks: Record<UserRole, NavLink[]> = {
  client: [
    {
      href: "/dashboard/client",
      label: "My events",
      icon: CalendarDays,
      match: ["/dashboard/client/event"],
    },
    {
      href: "/venue-designer",
      label: "Venue designer",
      icon: Wand2,
    },
    {
      href: "/dashboard/client/messages",
      label: "Messages",
      icon: MessageSquare,
    },
    {
      href: "/dashboard/client/settings",
      label: "Settings",
      icon: Settings,
    },
  ],
  planner: [
    { href: "/dashboard/planner", label: "Dashboard", icon: Home },
    {
      href: "/dashboard/planner/marketplace",
      label: "Marketplace",
      icon: Compass,
    },
    {
      href: "/dashboard/planner/proposals",
      label: "My proposals",
      icon: FileText,
      match: ["/dashboard/planner/event"],
    },
    {
      href: "/dashboard/planner/schedule",
      label: "Schedule",
      icon: CalendarDays,
    },
    {
      href: "/dashboard/planner/messages",
      label: "Messages",
      icon: MessageSquare,
    },
    {
      href: "/dashboard/planner/earnings",
      label: "Earnings",
      icon: Wallet,
    },
    {
      href: "/dashboard/planner/portfolio",
      label: "Portfolio",
      icon: ImageIcon,
    },
    {
      href: "/dashboard/planner/settings",
      label: "Settings",
      icon: Settings,
    },
  ],
  vendor: [
    { href: "/dashboard/vendor", label: "Dashboard", icon: Home },
    {
      href: "/dashboard/vendor/services",
      label: "Services",
      icon: Briefcase,
    },
    {
      href: "/dashboard/vendor/requests",
      label: "Requests",
      icon: Users,
    },
    {
      href: "/dashboard/vendor/calendar",
      label: "Calendar",
      icon: CalendarDays,
    },
    {
      href: "/dashboard/vendor/settings",
      label: "Settings",
      icon: Settings,
    },
  ],
  admin: [
    { href: "/dashboard/admin", label: "Overview", icon: Home },
    {
      href: "/dashboard/admin/payouts",
      label: "Payouts",
      icon: Wallet,
    },
    {
      href: "/dashboard/admin/audit",
      label: "Audit",
      icon: ShieldCheck,
    },
  ],
};

const roleEyebrow: Record<UserRole, string> = {
  client: "Your atelier",
  planner: "Atelier console",
  vendor: "Vendor console",
  admin: "Operations console",
};

function isLinkActive(pathname: string | null, link: NavLink): boolean {
  if (!pathname) return false;
  if (pathname === link.href) return true;
  // Exact-match for the role root (e.g. /dashboard/client) so it doesn't light
  // up for every child route. For other links, allow startsWith so nested
  // routes (e.g. /dashboard/client/event/123) keep "My events" highlighted.
  const isRoleRoot =
    link.href === "/dashboard/client" ||
    link.href === "/dashboard/planner" ||
    link.href === "/dashboard/vendor" ||
    link.href === "/dashboard/admin";
  if (!isRoleRoot && pathname.startsWith(link.href + "/")) return true;
  if (link.match?.some((prefix) => pathname.startsWith(prefix))) return true;
  return false;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const links = roleLinks[role];

  return (
    <aside className="hidden min-h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-rose-100/70 bg-gradient-to-b from-background via-rose-50/25 to-background lg:block">
      <div className="relative isolate flex h-full flex-col px-5 py-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grain-bg opacity-30"
        />

        <p className="relative z-10 mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          {roleEyebrow[role]}
        </p>
        <p className="font-display relative z-10 mb-5 text-2xl font-light leading-tight tracking-tight">
          Dashboard
        </p>
        <div
          aria-hidden
          className="champagne-hairline relative z-10 mb-5 h-px w-full"
        />

        <nav className="relative z-10 space-y-1">
          {links.map((link) => {
            const Icon = link.icon;
            const active = isLinkActive(pathname, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                  active
                    ? "bg-white/80 font-medium text-rose-700 shadow-sm ring-1 ring-rose-200/60 backdrop-blur-sm"
                    : "text-muted-foreground hover:bg-white/50 hover:text-foreground"
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-rose-500 to-amber-500"
                  />
                )}
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    active ? "text-rose-600" : "text-muted-foreground/80"
                  )}
                />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

export function MobileSidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const links = roleLinks[role];

  return (
    <div className="sticky top-16 z-30 flex gap-2 overflow-x-auto border-b border-rose-100/60 bg-background/85 px-3 py-2 backdrop-blur-md lg:hidden">
      {links.map((link) => {
        const Icon = link.icon;
        const active = isLinkActive(pathname, link);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-all",
              active
                ? "bg-gradient-to-r from-rose-500 to-amber-500 font-medium text-white shadow-sm"
                : "border border-rose-100/60 bg-white/70 text-muted-foreground"
            )}
          >
            <Icon className="h-3 w-3" />
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
