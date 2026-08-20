"use client";

import Link from "next/link";
import {
  Briefcase,
  CheckCircle2,
  Inbox,
  Star,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { decimalToNumber } from "@/lib/payments";
import { VendorOnboardingWizard } from "@/components/onboarding/vendor-wizard";

import { useFormatters } from "@/lib/use-formatters";
export default function VendorDashboardPage() {
  const me = trpc.vendors.me.useQuery();
  const f = useFormatters();
  const t = useTranslations("dashboard");
  const tSidebar = useTranslations("sidebar.eyebrow");
  const tSidebarLabel = useTranslations("sidebar");
  const tVendor = useTranslations("vendor");
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
    return <VendorOnboardingWizard />;
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
            {tSidebar("vendor")}
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
            {t("vendorWelcome", { name: firstName })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("vendorSubtitle")}
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={tVendor("pendingReleases")}
            tone="rose"
            value={f.currency(balance.data?.pendingAmount ?? 0)}
            hint={tVendor("pendingAwaitingPayout", {
              count: balance.data?.pendingCount ?? 0,
            })}
            icon={<Wallet className="size-4" />}
          />
          <Stat
            label={tVendor("lifetimeCollected")}
            value={f.currency(balance.data?.lifetimePaidOut ?? 0)}
            hint={tVendor("paidOffPlatform")}
            icon={<CheckCircle2 className="size-4" />}
          />
          <Stat
            label={tVendor("activeEngagementsLabel")}
            value={String(stats.data?.activeEngagements ?? 0)}
            hint={tVendor("incomingRequestsCount", {
              count: stats.data?.incomingRequests ?? 0,
            })}
            icon={<Briefcase className="size-4" />}
          />
          <Stat
            label={tVendor("reputation")}
            value={
              stats.data?.reviewCount
                ? `${Number(stats.data.avgRating).toFixed(1)} ★`
                : tVendor("noReviewsYet")
            }
            hint={tVendor("reviewsCount", {
              count: stats.data?.reviewCount ?? 0,
            })}
            icon={<Star className="size-4" />}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-brand-line px-5 py-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                  {tSidebarLabel("inbox")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {tVendor("inboxRequestsHint")}
                </p>
              </div>
              <Link
                href="/dashboard/vendor/inbox"
                className="text-xs font-medium text-rose-700 hover:underline"
              >
                {tVendor("openInbox")}
              </Link>
            </div>
            {requested.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Inbox className="mx-auto mb-2 size-6 text-rose-500" />
                <p className="text-sm text-muted-foreground">
                  {tVendor("noNewRequests")}
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
                                {f.date(e.event.event_date, "medium")}
                              </>
                            )}
                          </p>
                        </div>
                        <span className="font-mono text-sm tabular-nums">
                          {f.currency(
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
            <div className="rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
              <div className="border-b border-brand-line px-5 py-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                  {tVendor("activeEngagementsLabel")}
                </p>
              </div>
              {active.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  {tVendor("nothingActiveYet")}
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

            <div className="rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
              <div className="border-b border-brand-line px-5 py-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                  {tVendor("recentReviews")}
                </p>
              </div>
              {recentReviews.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  {tVendor("noReviewsCompleted")}
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
          : "rounded-2xl border border-brand-line bg-white/80 px-5 py-4 backdrop-blur-sm"
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

