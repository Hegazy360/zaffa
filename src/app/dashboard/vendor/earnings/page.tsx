"use client";

import Link from "next/link";
import { HandCoins, Loader2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { decimalToNumber } from "@/lib/payments";

import { useFormatters } from "@/lib/use-formatters";
const RELEASE_STATUS_KEY: Record<string, string> = {
  pending: "releaseStatusPending",
  paid: "releaseStatusPaid",
  cancelled: "releaseStatusCancelled",
};

const RELEASE_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-stone-100 text-stone-500",
};

export default function VendorEarningsPage() {
  const balance = trpc.vendorReleases.vendorBalance.useQuery();
  const f = useFormatters();
  const t = useTranslations("vendor");
  const releases = trpc.vendorReleases.forVendor.useQuery();

  if (balance.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!balance.data) return null;

  const currency = releases.data?.[0]?.currency ?? "EGP";
  const pending = (releases.data ?? []).filter((r) => r.status === "pending");
  const paid = (releases.data ?? []).filter((r) => r.status === "paid");

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative z-10 mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        <header>
          <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            {t("earningsLabel")}
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight">
            {t("earningsTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("earningsSubtitle")}
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label={t("pendingReleases")}
            tone="rose"
            value={f.currency(balance.data.pendingAmount, currency)}
            hint={t("pendingAwaitingPayout", {
              count: balance.data.pendingCount,
            })}
          />
          <Stat
            label={t("lifetimeReleased")}
            value={f.currency(balance.data.lifetimeReleased, currency)}
            hint={t("releasesCount", {
              count: balance.data.lifetimeReleasedCount,
            })}
          />
          <Stat
            label={t("paidOut")}
            value={f.currency(balance.data.lifetimePaidOut, currency)}
          />
        </div>

        <section className="rounded-2xl border border-brand-line bg-white/85 backdrop-blur-sm">
          <div className="border-b border-brand-line px-5 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              {t("pendingReleases")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("pendingReleasesHint")}
            </p>
          </div>
          {releases.isLoading ? (
            <div className="px-5 py-12 text-center">
              <Loader2 className="mx-auto size-5 animate-spin text-rose-500" />
            </div>
          ) : pending.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Wallet className="mx-auto mb-2 size-6 text-rose-500" />
              <p className="text-sm text-muted-foreground">
                {t("noPendingReleases")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-rose-100/70">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Link
                        href={`/dashboard/vendor/engagements/${r.engagement.id}`}
                        className="hover:text-rose-700 hover:underline"
                      >
                        {r.engagement.title}
                      </Link>
                      {" · "}
                      {r.planner.business_name}
                      {" · "}
                      {t("releaseRequestedDate", {
                        date: f.date(r.requested_at, "medium"),
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        RELEASE_TONE[r.status]
                      }`}
                    >
                      {RELEASE_STATUS_KEY[r.status]
                        ? t(RELEASE_STATUS_KEY[r.status])
                        : r.status}
                    </span>
                    <span className="font-mono tabular-nums">
                      {f.currency(decimalToNumber(r.amount), r.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-brand-line bg-white/85 backdrop-blur-sm">
          <div className="border-b border-brand-line px-5 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              {t("paidReleases")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("paidReleasesHint")}
            </p>
          </div>
          {paid.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <HandCoins className="mx-auto mb-2 size-6 text-rose-500" />
              <p className="text-sm text-muted-foreground">{t("noPaidReleases")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-rose-100/70">
              {paid.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Link
                        href={`/dashboard/vendor/engagements/${r.engagement.id}`}
                        className="hover:text-rose-700 hover:underline"
                      >
                        {r.engagement.title}
                      </Link>
                      {" · "}
                      {r.planner.business_name}
                      {r.paid_at && (
                        <>
                          {" · "}
                          {t("releasePaidDate", {
                            date: f.date(r.paid_at, "medium"),
                          })}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums">
                    {f.currency(decimalToNumber(r.amount), r.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "rose";
}) {
  return (
    <div
      className={
        tone === "rose"
          ? "rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-amber-50/60 px-5 py-4"
          : "rounded-2xl border border-brand-line bg-white/80 px-5 py-4 backdrop-blur-sm"
      }
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
        {label}
      </p>
      <p className="font-display mt-1 text-2xl font-light tracking-tight">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
