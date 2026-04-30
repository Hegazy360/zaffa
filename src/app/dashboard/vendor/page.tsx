"use client";

import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Inbox,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { decimalToNumber, formatCurrency } from "@/lib/payments";

export default function VendorDashboardPage() {
  const me = trpc.vendors.me.useQuery();
  const stats = trpc.vendors.stats.useQuery(undefined, {
    enabled: !!me.data,
  });
  const balance = trpc.vendorReleases.vendorBalance.useQuery(undefined, {
    enabled: !!me.data,
  });
  const incoming = trpc.vendorEngagements.incoming.useQuery(undefined, {
    enabled: !!me.data,
  });
  const reviews = trpc.vendorReviews.forVendor.useQuery(
    { vendorId: me.data?.id ?? "" },
    { enabled: !!me.data?.id },
  );

  if (me.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-12">
        <div className="h-12 w-72 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!me.data) {
    return <VendorSetupNeeded />;
  }

  const requested = (incoming.data ?? []).filter((e) => e.status === "requested");
  const active = (incoming.data ?? []).filter((e) =>
    ["accepted", "active"].includes(e.status),
  );
  const recentReviews = (reviews.data ?? []).slice(0, 3);
  const firstName = me.data.profile.full_name.split(" ")[0] ?? me.data.business_name;

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-40"
      />
      <div className="relative z-10 mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        <header className="space-y-2">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            Vendor console
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Catalog, requests, releases, reviews — your whole shop in one view.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Pending releases"
            tone="rose"
            value={formatCurrency(balance.data?.pendingAmount ?? 0)}
            hint={`${balance.data?.pendingCount ?? 0} awaiting payout`}
            icon={<Wallet className="size-4" />}
          />
          <Stat
            label="Lifetime collected"
            value={formatCurrency(balance.data?.lifetimePaidOut ?? 0)}
            hint="Paid out off-platform"
            icon={<CheckCircle2 className="size-4" />}
          />
          <Stat
            label="Active engagements"
            value={String(stats.data?.activeEngagements ?? 0)}
            hint={`${stats.data?.incomingRequests ?? 0} incoming requests`}
            icon={<Briefcase className="size-4" />}
          />
          <Stat
            label="Reputation"
            value={
              stats.data?.reviewCount
                ? `${Number(stats.data.avgRating).toFixed(1)} ★`
                : "No reviews yet"
            }
            hint={`${stats.data?.reviewCount ?? 0} reviews`}
            icon={<Star className="size-4" />}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                  Inbox
                </p>
                <p className="text-sm text-muted-foreground">
                  Engagement requests waiting on you.
                </p>
              </div>
              <Link
                href="/dashboard/vendor/inbox"
                className="text-xs font-medium text-rose-700 hover:underline"
              >
                Open inbox
              </Link>
            </div>
            {requested.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Inbox className="mx-auto mb-2 size-6 text-rose-500" />
                <p className="text-sm text-muted-foreground">
                  No new requests right now.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-rose-100/70">
                {requested.slice(0, 5).map((e) => (
                  <li key={e.id} className="px-5 py-4">
                    <Link
                      href={`/dashboard/vendor/engagements/${e.id}`}
                      className="block"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {e.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {e.planner.business_name} ·{" "}
                            {e.event.title}
                            {e.event.event_date && (
                              <>
                                {" · "}
                                {format(new Date(e.event.event_date), "PP")}
                              </>
                            )}
                          </p>
                        </div>
                        <span className="font-mono text-sm tabular-nums">
                          {formatCurrency(
                            decimalToNumber(e.total_amount),
                            e.currency,
                          )}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
              <div className="border-b border-rose-100/70 px-5 py-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                  Active engagements
                </p>
              </div>
              {active.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Nothing active yet.
                </div>
              ) : (
                <ul className="divide-y divide-rose-100/70">
                  {active.slice(0, 4).map((e) => (
                    <li key={e.id} className="px-5 py-3">
                      <Link
                        href={`/dashboard/vendor/engagements/${e.id}`}
                        className="block"
                      >
                        <p className="truncate text-sm font-medium">
                          {e.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {e.planner.business_name}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
              <div className="border-b border-rose-100/70 px-5 py-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                  Recent reviews
                </p>
              </div>
              {recentReviews.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No reviews yet — completed engagements unlock them.
                </div>
              ) : (
                <ul className="divide-y divide-rose-100/70">
                  {recentReviews.map((r) => (
                    <li key={r.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium">
                          {r.author.full_name}
                        </p>
                        <p className="text-xs">
                          {"★".repeat(r.rating)}
                          <span className="text-muted-foreground">
                            {"★".repeat(5 - r.rating)}
                          </span>
                        </p>
                      </div>
                      {r.comment && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {r.comment}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "rose";
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "rose"
          ? "rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-amber-50/60 px-5 py-4"
          : "rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4 backdrop-blur-sm"
      }
    >
      <div className="flex items-center justify-between text-rose-700/80">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em]">
          {label}
        </p>
        {icon && <span aria-hidden>{icon}</span>}
      </div>
      <p className="font-display mt-1 text-2xl font-light tracking-tight">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function VendorSetupNeeded() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-16 text-center sm:px-6">
      <div className="inline-flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white">
        <Sparkles className="size-5" />
      </div>
      <h1 className="font-display text-3xl font-light tracking-tight">
        Set up your vendor profile
      </h1>
      <p className="text-sm text-muted-foreground">
        Tell planners who you are, what you do, and how to reach you. Then list
        your catalog and start receiving engagement requests.
      </p>
      <Button
        render={<Link href="/dashboard/vendor/profile" />}
        className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
      >
        Get started <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
