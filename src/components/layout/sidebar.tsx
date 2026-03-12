"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import {
  CalendarDays,
  Home,
  MessageSquare,
  Settings,
  Star,
  Store,
  Users,
  Briefcase,
  ImageIcon,
} from "lucide-react";

interface SidebarProps {
  role: UserRole;
}

const roleLinks: Record<UserRole, { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[]> = {
  client: [
    { href: "/dashboard/client", label: "My Events", icon: CalendarDays },
    { href: "/dashboard/client/messages", label: "Messages", icon: MessageSquare },
    { href: "/ai/style-quiz", label: "Style Quiz", icon: Star },
    { href: "/dashboard/client/settings", label: "Settings", icon: Settings },
  ],
  planner: [
    { href: "/dashboard/planner", label: "Dashboard", icon: Home },
    { href: "/dashboard/planner/events", label: "Events", icon: CalendarDays },
    { href: "/dashboard/planner/portfolio", label: "Portfolio", icon: ImageIcon },
    { href: "/dashboard/planner/messages", label: "Messages", icon: MessageSquare },
    { href: "/dashboard/planner/settings", label: "Settings", icon: Settings },
  ],
  vendor: [
    { href: "/dashboard/vendor", label: "Dashboard", icon: Home },
    { href: "/dashboard/vendor/services", label: "Services", icon: Briefcase },
    { href: "/dashboard/vendor/requests", label: "Requests", icon: Users },
    { href: "/dashboard/vendor/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/dashboard/vendor/settings", label: "Settings", icon: Settings },
  ],
};

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const links = roleLinks[role];

  return (
    <aside className="w-64 border-r bg-muted/30 min-h-[calc(100vh-4rem)] p-4 hidden lg:block">
      <nav className="space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileSidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const links = roleLinks[role];

  return (
    <div className="flex gap-2 overflow-x-auto p-2 border-b lg:hidden">
      {links.map((link) => {
        const Icon = link.icon;
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
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
