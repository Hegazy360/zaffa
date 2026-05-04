"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpRight,
  HandCoins,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { decimalToNumber } from "@/lib/payments";

import { useFormatters } from "@/lib/use-formatters";
export default function PlannerEarningsPage() {
  const t = useTranslations("planner");
  const balance = trpc.payouts.plannerBalance.useQuery();
  const f = useFormatters();
  const pending = trpc.payouts.pendingInstallments.useQuery();
  const history = trpc.payouts.payoutHistory.useQuery();
  const requestPayout = trpc.payouts.requestPayout.useMutation({
    onSuccess: () => toast.success(t("payoutRequestedToast")),
    onError: (e) => toast.error(e.message),
  });

  if (balance.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!balance.data) return null;

  const currency =
    pending.data?.[0]?.currency ?? history.data?.[0]?.currency ?? "EGP";

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          {t("earningsEyebrow")}
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          {t("earningsTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("earningsSubtitle")}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label={t("statAvailableNow")}
          tone="rose"
          value={f.currency(balance.data.availableNow, currency)}
          hint={t("statAvailableNowHint")}
        />
        <Stat
          label={t("statAccrued")}
          value={f.currency(balance.data.accrued, currency)}
          hint={t("statAccruedHint", {
            amount: f.currency(balance.data.lifetimeCollected, currency),
          })}
        />
        <Stat
          label={t("statPendingPayout")}
          value={f.currency(balance.data.pendingNet, currency)}
          hint={t("statPendingPayoutHint", { count: pending.data?.length ?? 0 })}
        />
        <Stat
          label={t("statPaidOutSelf")}
          value={f.currency(balance.data.paidOutSelf, currency)}
        />
        <Stat
          label={t("statPaidOutVendors")}
          value={f.currency(balance.data.paidOutVendors, currency)}
          hint={t("statPaidOutVendorsHint")}
        />
        <Stat
          label={t("statCommittedVendors")}
          value={f.currency(balance.data.committedToVendors, currency)}
          hint={t("statCommittedVendorsHint")}
        />
      </div>

      <div className="rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
        <div className="flex flex-col gap-3 border-b border-rose-100/70 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              {t("awaitingPayout")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("awaitingPayoutHint")}
            </p>
          </div>
          <Button
            disabled={
              requestPayout.isPending || balance.data.pendingNet <= 0
            }
            onClick={() => requestPayout.mutate({})}
            className="w-full gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white sm:w-auto"
          >
            {requestPayout.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {t("requestPayout")}
          </Button>
        </div>
        {pending.isLoading ? (
          <div className="px-5 py-12 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-rose-500" />
          </div>
        ) : (pending.data?.length ?? 0) === 0 ? (
          <div className="px-5 py-12 text-center">
            <Wallet className="mx-auto mb-2 size-6 text-rose-500" />
            <p className="text-sm text-muted-foreground">
              {t("noPendingBalance")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {pending.data!.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <Link
                      href={`/dashboard/planner/event/${p.event.id}?tab=payments`}
                      className="hover:text-rose-700 hover:underline"
                    >
                      {p.event.title}
                    </Link>
                    {p.paid_at && (
                      <span className="ms-2 text-foreground/60">
                        {t("paidOnLabel", {
                          date: f.date(p.paid_at, "medium"),
                        })}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="font-mono tabular-nums">
                    {f.currency(
                      decimalToNumber(p.net_to_planner_amount),
                      p.currency
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t("grossLabel", {
                      amount: f.currency(
                        decimalToNumber(p.amount),
                        p.currency,
                      ),
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
        <div className="border-b border-rose-100/70 px-5 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            {t("payoutHistory")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("payoutHistoryHint")}
          </p>
        </div>
        {history.isLoading ? (
          <div className="px-5 py-12 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-rose-500" />
          </div>
        ) : (history.data?.length ?? 0) === 0 ? (
          <div className="px-5 py-12 text-center">
            <HandCoins className="mx-auto mb-2 size-6 text-rose-500" />
            <p className="text-sm text-muted-foreground">{t("noPayoutsYet")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {history.data!.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 px-5 py-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {f.date(p.paid_at, "medium")} ·{" "}
                    <span className="capitalize text-foreground/80">
                      {p.method}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("installmentsCount", { count: p.installments.length })}
                    {p.reference && (
                      <span className="ms-2 inline-flex items-center gap-1">
                        <ArrowUpRight className="size-3" />
                        {p.reference}
                      </span>
                    )}
                  </p>
                </div>
                <span className="font-mono tabular-nums">
                  {f.currency(decimalToNumber(p.amount), p.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
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
          : "rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4 backdrop-blur-sm"
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
