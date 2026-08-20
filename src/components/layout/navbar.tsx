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
import type { NavUser } from "@/lib/auth-user";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";

function isActiveRoute(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

interface NavbarProps {
  /**
   * Pre-resolved current user from the server. When provided, the navbar
   * renders the avatar / NotificationBell on the very first paint instead
   * of waiting for a client-side auth round-trip — which means
   * NotificationBell's tRPC queries fire in the same batch as the page's
   * own queries instead of a tick later. Pass `null` for pages where you
   * already know the visitor is anonymous; omit entirely on pages that
   * don't have the info server-side (the navbar will then do its own fast
   * `getClaims()` lookup).
   */
  initialUser?: NavUser | null;
}

export function Navbar({ initialUser }: NavbarProps = {}) {
  const [open, setOpen] = useState(false);
  // If the server told us who the user is, we're authoritative on first
  // render — no loading flicker. If `initialUser` was omitted (undefined),
  // start in the loading state and resolve client-side via `getClaims()`.
  const [user, setUser] = useState<NavUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(initialUser === undefined);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const t = useTranslations("nav");
  const tBrand = useTranslations("brand");

  useEffect(() => {
    let mounted = true;

    // Only run the client-side lookup when the server didn't already
    // populate `initialUser`. `getClaims()` verifies the JWT signature
    // locally via the project's published JWK (cached) — no round-trip
    // to Supabase Auth, unlike `getUser()`.
    if (initialUser === undefined) {
      void supabase.auth.getClaims().then(({ data }) => {
        if (!mounted) return;
        const claims = data?.claims;
        if (!claims?.sub) {
          setUser(null);
        } else {
          const meta = (claims.user_metadata ?? {}) as {
            full_name?: unknown;
            avatar_url?: unknown;
          };
          setUser({
            id: claims.sub,
            email:
              typeof claims.email === "string" ? claims.email : null,
            fullName:
              typeof meta.full_name === "string" ? meta.full_name : null,
            avatarUrl:
              typeof meta.avatar_url === "string" ? meta.avatar_url : null,
            isAnonymous: claims.is_anonymous === true,
          });
        }
        setLoading(false);
      });
    }

    // Always subscribe to auth state changes so sign-in / sign-out in
    // another tab (or the sign-out button below) flips the UI live.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (!u) {
        setUser(null);
      } else {
        const meta = (u.user_metadata ?? {}) as {
          full_name?: unknown;
          avatar_url?: unknown;
        };
        setUser({
          id: u.id,
          email: u.email ?? null,
          fullName:
            typeof meta.full_name === "string" ? meta.full_name : null,
          avatarUrl:
            typeof meta.avatar_url === "string" ? meta.avatar_url : null,
          isAnonymous: u.is_anonymous === true,
        });
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase.auth, initialUser]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  };

  // Anonymous Supabase users (first-touch venue-designer visitors who
  // haven't entered an email yet) are treated as logged-out for the
  // navbar's marketing affordances. They still have a valid JWT and
  // their designer state is persisted, but surfacing an avatar +
  // dashboard menu would be misleading and clutter the cold-traffic
  // experience.
  const visibleUser = user && !user.isAnonymous ? user : null;
  const userInitial = visibleUser?.fullName
    ? visibleUser.fullName.charAt(0).toUpperCase()
    : visibleUser?.email?.charAt(0).toUpperCase() ?? "?";

  const displayName = visibleUser?.fullName ?? visibleUser?.email ?? "";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4">
        <Link
          href="/"
          className="group flex items-center gap-2"
          aria-label={t("ariaHome")}
        >
          <span className="font-display text-brand-gradient text-2xl font-light italic tracking-tight transition-opacity group-hover:opacity-90">
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
            className="group gap-2 bg-brand-gradient text-white shadow-glow-sm hover:opacity-90 hover:shadow-glow-lg"
          >
            <Wand2 className="h-4 w-4" />
            {t("startDesigning")}
            <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Button>

          {loading ? (
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          ) : visibleUser ? (
            <>
              <NotificationBell userId={visibleUser.id} />
              <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("accountMenu")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-600 to-amber-500 text-sm font-semibold text-white shadow-glow-sm ring-2 ring-transparent transition-all hover:shadow-md hover:shadow-glow-lg hover:ring-rose-200 focus-visible:ring-rose-300 focus-visible:outline-none"
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
                    {visibleUser.email && displayName !== visibleUser.email && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {visibleUser.email}
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
            <div className="relative isolate overflow-hidden border-b bg-gradient-to-br from-rose-50 via-rose-50/80 to-amber-50 px-6 pt-6 pb-5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 grain-bg opacity-40"
              />
              {visibleUser ? (
                <div className="relative flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-rose-600 to-amber-500 text-sm font-semibold text-white shadow-glow-sm">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {displayName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {visibleUser.email}
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
                className="group w-full justify-center gap-2 bg-brand-gradient text-white shadow-glow-sm hover:opacity-90"
              >
                <Wand2 className="h-4 w-4" />
                {t("startDesigning")}
                <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Button>

              {visibleUser && (
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
                        ? "bg-rose-50 text-rose-700"
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
              {visibleUser ? (
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
          ? "bg-rose-50 text-rose-700"
          : "bg-accent/40 text-foreground hover:bg-accent"
      )}
    >
      <Bell className="h-4 w-4" />
      <span className="flex-1">{label}</span>
      {unread > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-rose-600 to-amber-500 px-1.5 text-xs font-semibold leading-none text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
