"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";
import { Sparkline } from "@/components/admin/sparkline";
import { ActivityRow } from "@/components/admin/activity-row";

export default function AdminOverview() {
  const t = useTranslations("admin");
  const f = useFormatters();
  const kpis = trpc.adminOverview.kpis.useQuery();
  const activity = trpc.adminOverview.activity.useQuery({ limit: 30 });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          {t("operationsConsole")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("operationsConsoleSubtitle")}
        </p>
      </header>

      {kpis.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-rose-500" />
        </div>
      ) : kpis.data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={t("kpiClients")}
              value={kpis.data.users.clients.value.toString()}
              delta={kpis.data.users.clients.delta30}
              spark={kpis.data.users.clients.spark}
              icon={<Users className="size-4" />}
            />
            <KpiCard
              label={t("kpiPlanners")}
              value={kpis.data.users.planners.value.toString()}
              delta={kpis.data.users.planners.delta30}
              spark={kpis.data.users.planners.spark}
              icon={<UserRound className="size-4" />}
            />
            <KpiCard
              label={t("kpiVendors")}
              value={kpis.data.users.vendors.value.toString()}
              delta={kpis.data.users.vendors.delta30}
              spark={kpis.data.users.vendors.spark}
              icon={<Briefcase className="size-4" />}
            />
            <KpiCard
              label={t("kpiActiveEvents")}
              value={kpis.data.events.active.toString()}
              delta={kpis.data.events.delta30}
              spark={kpis.data.events.spark}
              icon={<CalendarDays className="size-4" />}
              hint={t("kpiActiveEventsHint", {
                total: kpis.data.events.total,
              })}
            />
            <KpiCard
              label={t("kpiGmvLifetime")}
              value={f.currency(kpis.data.gmv.lifetime)}
              delta={kpis.data.gmv.delta30}
              spark={kpis.data.gmv.spark}
              icon={<Wallet className="size-4" />}
              hint={t("kpiGmvLast30", {
                amount: f.currency(kpis.data.gmv.last30),
              })}
              tone="rose"
            />
            <KpiCard
              label={t("kpiAcceptRate")}
              value={`${kpis.data.proposals.acceptRate}%`}
              spark={kpis.data.proposals.spark}
              icon={<TrendingUp className="size-4" />}
              hint={t("kpiAcceptRateHint", {
                accepted: kpis.data.proposals.accepted,
                total: kpis.data.proposals.total,
              })}
            />
            <KpiCard
              label={t("kpiAvgDaysToAccept")}
              value={
                kpis.data.proposals.avgDaysToAccept > 0
                  ? f.number(kpis.data.proposals.avgDaysToAccept)
                  : "—"
              }
              spark={kpis.data.proposals.spark}
              icon={<TrendingUp className="size-4" />}
              hint={t("kpiAvgDaysToAcceptHint")}
            />
            <KpiCard
              label={t("kpiPendingPayouts")}
              value={f.currency(
                kpis.data.payouts.pendingPlanner +
                  kpis.data.payouts.pendingVendor,
              )}
              spark={kpis.data.gmv.spark}
              icon={<Wallet className="size-4" />}
              hint={t("kpiPendingPayoutsHint", {
                planner: f.currency(kpis.data.payouts.pendingPlanner),
                vendor: f.currency(kpis.data.payouts.pendingVendor),
              })}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-brand-line px-5 py-4">
                <div>
                  <p className="text-eyebrow font-medium text-rose-700/80">
                    {t("recentActivity")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("recentActivityHint")}
                  </p>
                </div>
                <Link
                  href="/dashboard/admin/activity"
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline"
                >
                  {t("viewAll")}
                  <ArrowRight className="size-3 rtl:-scale-x-100" />
                </Link>
              </div>
              {activity.isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-rose-500" />
                </div>
              ) : (activity.data?.items.length ?? 0) === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("noActivityYet")}
                </p>
              ) : (
                <ul className="divide-y divide-rose-100/70">
                  {activity.data!.items.map((item, idx) => (
                    <ActivityRow
                      key={`${item.type}-${idx}`}
                      item={
                        item as {
                          type:
                            | "signup"
                            | "event"
                            | "proposal"
                            | "payment"
                            | "engagement"
                            | "release"
                            | "review";
                          at: string | Date;
                          data: { id: string };
                        }
                      }
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <ShortcutCard
                href="/dashboard/admin/users"
                title={t("manageUsers")}
                hint={t("manageUsersHint")}
                icon={<Users className="size-4" />}
              />
              <ShortcutCard
                href="/dashboard/admin/prospects"
                title={t("prospectsTitle")}
                hint={t("prospectsHint")}
                icon={<UserRound className="size-4" />}
              />
              <ShortcutCard
                href="/dashboard/admin/discovery"
                title={t("discoveryTitle")}
                hint={t("discoveryHint")}
                icon={<TrendingDown className="size-4" />}
              />
              <ShortcutCard
                href="/dashboard/admin/payouts"
                title={t("plannerPayoutsTitle")}
                hint={t("plannerPayoutsHint")}
                icon={<Wallet className="size-4" />}
              />
              <ShortcutCard
                href="/dashboard/admin/vendor-payouts"
                title={t("vendorPayoutsTitle")}
                hint={t("vendorPayoutsHint")}
                icon={<Briefcase className="size-4" />}
              />
              <ShortcutCard
                href="/dashboard/admin/vision-packs"
                title={t("visionPacksTitle")}
                hint={t("visionPacksHint")}
                icon={<Sparkles className="size-4" />}
              />
              <ShortcutCard
                href="/dashboard/admin/vision-pack-pricing"
                title={t("visionPackPricingTitle")}
                hint={t("visionPackPricingHint")}
                icon={<Sparkles className="size-4" />}
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  spark,
  icon,
  hint,
  tone,
}: {
  label: string;
  value: string;
  delta?: number;
  spark: Array<{ d: string; v: number }>;
  icon?: React.ReactNode;
  hint?: string;
  tone?: "rose";
}) {
  return (
    <div
      className={
        tone === "rose"
          ? "rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-amber-50/60 p-5"
          : "rounded-2xl border border-brand-line bg-white/80 p-5 backdrop-blur-sm"
      }
    >
      <div className="flex items-center justify-between text-rose-700/80">
        <p className="text-eyebrow font-medium">
          {label}
        </p>
        {icon && <span aria-hidden>{icon}</span>}
      </div>
      <p className="font-display mt-1 text-2xl font-light tracking-tight">
        {value}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {hint}
          {delta != null && (
            <span
              className={`ms-2 inline-flex items-center gap-0.5 font-medium ${
                delta > 0
                  ? "text-emerald-700"
                  : delta < 0
                    ? "text-rose-700"
                    : "text-muted-foreground"
              }`}
            >
              {delta > 0 ? (
                <TrendingUp className="size-3" />
              ) : delta < 0 ? (
                <TrendingDown className="size-3" />
              ) : null}
              {delta > 0 ? "+" : ""}
              {delta}%
            </span>
          )}
        </div>
        <Sparkline data={spark} className="text-rose-500" />
      </div>
    </div>
  );
}

function ShortcutCard({
  href,
  title,
  hint,
  icon,
}: {
  href: string;
  title: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-start gap-3 rounded-2xl border border-brand-line bg-white/80 p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_15px_40px_-20px_rgba(244,63,94,0.25)]"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-rose-100 to-amber-100 text-rose-700">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-light leading-tight tracking-tight">
          {title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <ArrowRight className="size-3.5 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
    </Link>
  );
}
