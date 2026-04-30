"use client";

import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowUpRight,
  HandCoins,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { decimalToNumber, formatCurrency } from "@/lib/payments";

export default function PlannerEarningsPage() {
  const balance = trpc.payouts.plannerBalance.useQuery();
  const pending = trpc.payouts.pendingInstallments.useQuery();
  const history = trpc.payouts.payoutHistory.useQuery();
  const requestPayout = trpc.payouts.requestPayout.useMutation({
    onSuccess: () => toast.success("Payout requested. We'll be in touch."),
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
          Earnings
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          Your money flow
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every paid installment, the platform&apos;s cut, and what we owe you.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Pending payout"
          tone="rose"
          value={formatCurrency(balance.data.pendingNet, currency)}
          hint={`Across ${pending.data?.length ?? 0} paid installments`}
        />
        <Stat
          label="Lifetime collected"
          value={formatCurrency(balance.data.lifetimeCollected, currency)}
          hint={`Fees ${formatCurrency(
            balance.data.lifetimeFees,
            currency
          )}`}
        />
        <Stat
          label="Lifetime paid out"
          value={formatCurrency(balance.data.lifetimePaidOut, currency)}
        />
      </div>

      <div className="rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              Awaiting payout
            </p>
            <p className="text-sm text-muted-foreground">
              Paid installments that haven&apos;t been paid out to you yet.
            </p>
          </div>
          <Button
            disabled={
              requestPayout.isPending || balance.data.pendingNet <= 0
            }
            onClick={() => requestPayout.mutate({})}
            className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
          >
            {requestPayout.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Request payout
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
              No pending balance — paid installments will show up here as
              clients pay.
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
                      <span className="ml-2 text-foreground/60">
                        Paid {format(new Date(p.paid_at), "PP")}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="font-mono tabular-nums">
                    {formatCurrency(
                      decimalToNumber(p.net_to_planner_amount),
                      p.currency
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Gross {formatCurrency(decimalToNumber(p.amount), p.currency)}
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
            Payout history
          </p>
          <p className="text-sm text-muted-foreground">
            Off-Stripe transfers we&apos;ve recorded to you.
          </p>
        </div>
        {history.isLoading ? (
          <div className="px-5 py-12 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-rose-500" />
          </div>
        ) : (history.data?.length ?? 0) === 0 ? (
          <div className="px-5 py-12 text-center">
            <HandCoins className="mx-auto mb-2 size-6 text-rose-500" />
            <p className="text-sm text-muted-foreground">No payouts yet.</p>
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
                    {format(new Date(p.paid_at), "PP")} ·{" "}
                    <span className="capitalize text-foreground/80">
                      {p.method}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.installments.length} installments
                    {p.reference && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <ArrowUpRight className="size-3" />
                        {p.reference}
                      </span>
                    )}
                  </p>
                </div>
                <span className="font-mono tabular-nums">
                  {formatCurrency(decimalToNumber(p.amount), p.currency)}
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
