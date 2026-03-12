"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Menu,
  Compass,
  CalendarHeart,
  Store,
  Sparkles,
  LogIn,
  LogOut,
  ArrowRight,
  LayoutDashboard,
  User,
} from "lucide-react";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const navLinks = [
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/planners", label: "Planners", icon: CalendarHeart },
  { href: "/vendors", label: "Vendors", icon: Store },
  { href: "/ai/style-quiz", label: "Style Quiz", icon: Sparkles },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

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
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 mx-auto max-w-7xl">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
            Zaffa
          </span>
          <span className="text-sm text-muted-foreground hidden sm:inline">
            زفّة
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop auth area */}
        <div className="hidden md:flex items-center gap-3">
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-lg bg-muted" />
          ) : user ? (
            <>
              <Button
                variant="ghost"
                render={<Link href="/dashboard" />}
                className="gap-2"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center justify-center rounded-lg px-3 h-8 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Sign Out
              </button>
              <Link
                href="/dashboard"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-rose-600 to-amber-500 text-xs font-semibold text-white"
              >
                {userInitial}
              </Link>
            </>
          ) : (
            <>
              <Button variant="ghost" render={<Link href="/auth/signin" />}>
                Sign In
              </Button>
              <Button
                render={<Link href="/auth/signup" />}
                className="bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
              >
                Get Started
              </Button>
            </>
          )}
        </div>

        {/* Mobile sheet */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="md:hidden inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 w-9">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0 flex flex-col">
            {/* Branding header */}
            <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-br from-rose-50 to-amber-50 dark:from-rose-950/30 dark:to-amber-950/30">
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-rose-600 to-amber-500 text-sm font-semibold text-white">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Link
                    href="/"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2"
                  >
                    <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
                      Zaffa
                    </span>
                    <span className="text-sm text-muted-foreground">زفّة</span>
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your dream event, expertly planned
                  </p>
                </>
              )}
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-3 py-4">
              <div className="space-y-1">
                {user && (
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground bg-accent/50 transition-colors hover:bg-accent"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Link>
                )}
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Auth section */}
            <div className="border-t px-4 py-4 space-y-2">
              {user ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-center gap-2"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              ) : (
                <>
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
                    Sign In
                  </Button>
                  <Button
                    render={
                      <Link
                        href="/auth/signup"
                        onClick={() => setOpen(false)}
                      />
                    }
                    className="w-full justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
                    size="lg"
                  >
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
