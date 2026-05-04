"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Menu,
  Wand2,
  LogIn,
  LogOut,
  ArrowRight,
  LayoutDashboard,
  Bell,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";

function isActiveRoute(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const t = useTranslations("nav");
  const tBrand = useTranslations("brand");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  };

  const userInitial = user?.user_metadata?.full_name
    ? (user.user_metadata.full_name as string).charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() ?? "?";

  const displayName =
    (user?.user_metadata?.full_name as string) ?? user?.email ?? "";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4">
        <Link
          href="/"
          className="group flex items-center gap-2"
          aria-label={t("ariaHome")}
        >
          <span className="font-display bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 bg-clip-text text-2xl font-light italic tracking-tight text-transparent transition-opacity group-hover:opacity-90">
            {tBrand("name")}
          </span>
          <span className="font-arabic hidden text-sm text-muted-foreground sm:inline">
            {tBrand("nameArabic")}
          </span>
        </Link>

        {/* Desktop auth area — single primary CTA points at the venue designer
            (the only product surface), with sign-in/avatar alongside. */}
        <div className="hidden items-center gap-3 md:flex">
          <LocaleSwitcher />

          <Button
            render={<Link href="/venue-designer" />}
            className="group gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-md shadow-rose-600/20 hover:opacity-90 hover:shadow-rose-600/30"
          >
            <Wand2 className="h-4 w-4" />
            {t("startDesigning")}
            <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Button>

          {loading ? (
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <>
              <NotificationBell userId={user.id} />
              <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("accountMenu")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-600 to-amber-500 text-sm font-semibold text-white shadow-sm shadow-rose-600/20 ring-2 ring-transparent transition-all hover:shadow-md hover:shadow-rose-600/30 hover:ring-rose-200 focus-visible:ring-rose-300 focus-visible:outline-none dark:hover:ring-rose-900/60"
              >
                {userInitial}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className="min-w-60 p-1.5"
              >
                {/* Base UI requires GroupLabel to live inside a Group. */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2 py-2">
                    <p className="text-sm leading-tight font-medium">
                      {displayName || t("yourAccount")}
                    </p>
                    {user.email && displayName !== user.email && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    )}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard")}
                  className="gap-2 px-2 py-2"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {t("dashboard")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/venue-designer")}
                  className="gap-2 px-2 py-2"
                >
                  <Wand2 className="h-4 w-4" />
                  {t("myDesigns")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="gap-2 px-2 py-2"
                >
                  <LogOut className="h-4 w-4" />
                  {t("signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <Button
              variant="ghost"
              render={<Link href="/auth/signin" />}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t("signIn")}
            </Button>
          )}
        </div>

        {/* Mobile sheet */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">{t("toggleMenu")}</span>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-80 flex-col p-0">
            {/* Branded header */}
            <div className="relative isolate overflow-hidden border-b bg-gradient-to-br from-rose-50 via-rose-50/80 to-amber-50 px-6 pt-6 pb-5 dark:from-rose-950/50 dark:via-rose-950/30 dark:to-amber-950/30">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 grain-bg opacity-40"
              />
              {user ? (
                <div className="relative flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-rose-600 to-amber-500 text-sm font-semibold text-white shadow-md shadow-rose-600/20">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {displayName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <Link
                    href="/"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2"
                  >
                    <span className="font-display bg-gradient-to-br from-rose-600 to-amber-500 bg-clip-text text-2xl font-light italic tracking-tight text-transparent">
                      {tBrand("name")}
                    </span>
                    <span className="font-arabic text-sm text-muted-foreground">
                      {tBrand("nameArabic")}
                    </span>
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tBrand("tagline")}
                  </p>
                </div>
              )}
            </div>

            {/* Primary CTA + (signed-in) dashboard shortcut */}
            <nav className="flex-1 px-4 py-5">
              <Button
                render={
                  <Link
                    href="/venue-designer"
                    onClick={() => setOpen(false)}
                  />
                }
                size="lg"
                className="group w-full justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-md shadow-rose-600/20 hover:opacity-90"
              >
                <Wand2 className="h-4 w-4" />
                {t("startDesigning")}
                <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Button>

              {user && (
                <>
                  <MobileNotificationsLink
                    pathname={pathname}
                    onNavigate={() => setOpen(false)}
                    label={t("notifications")}
                  />
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className={cn(
                      "mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActiveRoute(pathname, "/dashboard")
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
                        : "bg-accent/40 text-foreground hover:bg-accent"
                    )}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    {t("dashboard")}
                  </Link>
                </>
              )}
            </nav>

            {/* Auth section */}
            <div className="space-y-2 border-t px-4 py-4">
              <div className="mb-2 flex justify-center">
                <LocaleSwitcher variant="outline" align="end" />
              </div>
              {user ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-center gap-2"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                  {t("signOut")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  render={
                    <Link
                      href="/auth/signin"
                      onClick={() => setOpen(false)}
                    />
                  }
                  className="w-full justify-center gap-2"
                  size="lg"
                >
                  <LogIn className="h-4 w-4" />
                  {t("signIn")}
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

/**
 * Notifications entry inside the mobile sheet — links to the full inbox
 * and shows a small unread count badge. Kept as a Link (not a dropdown)
 * so it works reliably inside the Sheet on touch devices.
 */
function MobileNotificationsLink({
  pathname,
  onNavigate,
  label,
}: {
  pathname: string | null;
  onNavigate: () => void;
  label: string;
}) {
  const { data: count } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
    retry: false,
  });
  const unread = count?.count ?? 0;
  const active = isActiveRoute(pathname, "/dashboard/notifications");
  return (
    <Link
      href="/dashboard/notifications"
      onClick={onNavigate}
      className={cn(
        "mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
          : "bg-accent/40 text-foreground hover:bg-accent"
      )}
    >
      <Bell className="h-4 w-4" />
      <span className="flex-1">{label}</span>
      {unread > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-rose-600 to-amber-500 px-1.5 text-[10px] font-semibold leading-none text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
