"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import {
  Activity,
  Bell,
  CalendarDays,
  Compass,
  FileText,
  Home,
  Inbox,
  MessageSquare,
  Radar,
  Send,
  Settings,
  Store,
  Target,
  UserRound,
  Users,
  Wallet,
  Wand2,
  Briefcase,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";

interface SidebarProps {
  role: UserRole;
}

interface NavLink {
  href: string;
  // Translation key under the `sidebar` namespace. We swap from a static
  // `label` to a key so the same nav model works for both LTR English and
  // RTL Arabic without each surface re-importing copy.
  labelKey: string;
  icon: LucideIcon;
  // Optional: list of additional path prefixes that should still highlight
  // this link as active.
  match?: string[];
  // When true, the link only highlights on an exact `pathname === href`.
  // Used for parent links that have visible children in the nav (e.g. the
  // Outreach kanban + Outreach > Templates pair) to avoid double-highlighting.
  exact?: boolean;
}

const roleLinks: Record<UserRole, NavLink[]> = {
  client: [
    {
      href: "/dashboard/client",
      labelKey: "myEvents",
      icon: CalendarDays,
      match: ["/dashboard/client/event"],
    },
    {
      href: "/venue-designer",
      labelKey: "venueDesigner",
      icon: Wand2,
    },
    {
      href: "/dashboard/client/messages",
      labelKey: "messages",
      icon: MessageSquare,
    },
    {
      href: "/dashboard/notifications",
      labelKey: "notifications",
      icon: Bell,
    },
    {
      href: "/dashboard/client/settings",
      labelKey: "settings",
      icon: Settings,
    },
  ],
  planner: [
    { href: "/dashboard/planner", labelKey: "dashboard", icon: Home },
    {
      href: "/dashboard/planner/marketplace",
      labelKey: "marketplace",
      icon: Compass,
    },
    {
      href: "/dashboard/planner/vendors",
      labelKey: "vendors",
      icon: Store,
    },
    {
      href: "/dashboard/planner/proposals",
      labelKey: "myProposals",
      icon: FileText,
      match: ["/dashboard/planner/event"],
    },
    {
      href: "/dashboard/planner/schedule",
      labelKey: "schedule",
      icon: CalendarDays,
    },
    {
      href: "/dashboard/planner/messages",
      labelKey: "messages",
      icon: MessageSquare,
    },
    {
      href: "/dashboard/planner/earnings",
      labelKey: "earnings",
      icon: Wallet,
    },
    {
      href: "/dashboard/planner/portfolio",
      labelKey: "portfolio",
      icon: ImageIcon,
    },
    {
      href: "/dashboard/notifications",
      labelKey: "notifications",
      icon: Bell,
    },
    {
      href: "/dashboard/planner/settings",
      labelKey: "settings",
      icon: Settings,
    },
  ],
  vendor: [
    { href: "/dashboard/vendor", labelKey: "dashboard", icon: Home },
    {
      href: "/dashboard/vendor/catalog",
      labelKey: "catalog",
      icon: Briefcase,
    },
    {
      href: "/dashboard/vendor/inbox",
      labelKey: "inbox",
      icon: Inbox,
    },
    {
      href: "/dashboard/vendor/engagements",
      labelKey: "engagements",
      icon: FileText,
      match: ["/dashboard/vendor/engagements"],
    },
    {
      href: "/dashboard/vendor/earnings",
      labelKey: "earnings",
      icon: Wallet,
    },
    {
      href: "/dashboard/vendor/profile",
      labelKey: "profile",
      icon: UserRound,
    },
    {
      href: "/dashboard/notifications",
      labelKey: "notifications",
      icon: Bell,
    },
    {
      href: "/dashboard/vendor/settings",
      labelKey: "settings",
      icon: Settings,
    },
  ],
  admin: [
    { href: "/dashboard/admin", labelKey: "overview", icon: Home },
    {
      href: "/dashboard/admin/users",
      labelKey: "users",
      icon: Users,
      match: ["/dashboard/admin/users"],
    },
    {
      href: "/dashboard/admin/activity",
      labelKey: "activity",
      icon: Activity,
    },
    {
      href: "/dashboard/admin/prospects",
      labelKey: "prospects",
      icon: Target,
      match: ["/dashboard/admin/prospects"],
    },
    {
      href: "/dashboard/admin/discovery",
      labelKey: "discovery",
      icon: Radar,
      match: ["/dashboard/admin/discovery"],
    },
    {
      href: "/dashboard/admin/outreach",
      labelKey: "outreach",
      icon: Send,
      exact: true,
    },
    {
      href: "/dashboard/admin/outreach/templates",
      labelKey: "templates",
      icon: FileText,
    },
    {
      href: "/dashboard/admin/payouts",
      labelKey: "plannerPayouts",
      icon: Wallet,
    },
    {
      href: "/dashboard/admin/vendor-payouts",
      labelKey: "vendorPayouts",
      icon: Store,
    },
  ],
};

function isLinkActive(pathname: string | null, link: NavLink): boolean {
  if (!pathname) return false;
  if (pathname === link.href) return true;
  if (link.exact) return false;
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
  const t = useTranslations("sidebar");
  const links = roleLinks[role];

  return (
    <aside className="hidden min-h-[calc(100vh-4rem)] w-64 shrink-0 border-e border-rose-100/70 bg-gradient-to-b from-background via-rose-50/25 to-background lg:block">
      <div className="relative isolate flex h-full flex-col px-5 py-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grain-bg opacity-30"
        />

        <p className="relative z-10 mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          {t(`eyebrow.${role}`)}
        </p>
        <p className="font-display relative z-10 mb-5 text-2xl font-light leading-tight tracking-tight">
          {t("title")}
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
                    className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-gradient-to-b from-rose-500 to-amber-500"
                  />
                )}
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    active ? "text-rose-600" : "text-muted-foreground/80"
                  )}
                />
                {t(link.labelKey)}
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
  const t = useTranslations("sidebar");
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
            {t(link.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
