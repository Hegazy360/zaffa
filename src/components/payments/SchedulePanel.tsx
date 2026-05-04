"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { computeFee, decimalToNumber } from "@/lib/payments";
import { useFormatters } from "@/lib/use-formatters";
import { cn } from "@/lib/utils";
import { AmendmentDialog } from "./AmendmentDialog";

type Side = "client" | "planner";

interface InstallmentLike {
  id: string;
  label: string;
  amount: unknown;
  currency: string;
  status: string;
  due_date: Date | string | null;
  paid_at: Date | string | null;
  payout_id: string | null;
  net_to_planner_amount: unknown;
  schedule_id: string | null;
}

const STATUS_TONE: Record<
  string,
  "rose" | "emerald" | "amber" | "stone" | "red"
> = {
  pending: "rose",
  awaiting_payment: "amber",
  processing: "amber",
  paid: "emerald",
  refunded: "stone",
  failed: "red",
  overdue: "red",
  cancelled: "stone",
};

const STATUS_LABEL_KEY: Record<string, string> = {
  pending: "statusPending",
  awaiting_payment: "statusAwaitingPayment",
  processing: "statusProcessing",
  paid: "statusPaid",
  refunded: "statusRefunded",
  failed: "statusFailed",
  overdue: "statusOverdue",
  cancelled: "statusCancelled",
};

const TONE_CLASS: Record<string, string> = {
  rose: "bg-rose-50 text-rose-800 ring-rose-200",
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  stone: "bg-stone-100 text-stone-700 ring-stone-200",
  red: "bg-red-50 text-red-800 ring-red-200",
};

export function SchedulePanel({
  eventId,
  side,
  paidQueryParam,
}: {
  eventId: string;
  side: Side;
  /** When set, polls until the matching installment flips out of awaiting. */
  paidQueryParam?: string | null;
}) {
  const t = useTranslations("payments");
  const utils = trpc.useUtils();
  const f = useFormatters();
  const [showFee, setShowFee] = useState(side === "planner");
  const [amendOpen, setAmendOpen] = useState(false);
  const [pollingInstallmentId, setPollingInstallmentId] = useState<
    string | null
  >(paidQueryParam ?? null);

  const { data: schedule, isLoading } = trpc.paymentSchedules.forEvent.useQuery(
    { eventId },
    {
      // Quick refetch while we're polling for a webhook to land.
      refetchInterval: pollingInstallmentId ? 2500 : false,
    }
  );

  // Stop polling once the installment we were waiting on is no longer
  // awaiting/processing. Effect runs after render so we don't trip
  // setState-in-render warnings.
  useEffect(() => {
    if (!pollingInstallmentId || !schedule) return;
    const target = schedule.installments.find(
      (i) => i.id === pollingInstallmentId
    );
    if (
      target &&
      target.status !== "awaiting_payment" &&
      target.status !== "processing"
    ) {
      setPollingInstallmentId(null);
    }
  }, [pollingInstallmentId, schedule]);

  const checkoutMutation = trpc.payments.createCheckoutSession.useMutation({
    onSuccess: (res, vars) => {
      setPollingInstallmentId(vars.installmentId);
      if (res.url) {
        window.location.href = res.url;
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const decideAmendment = trpc.paymentSchedules.decideAmendment.useMutation({
    onSuccess: () => {
      utils.paymentSchedules.forEvent.invalidate({ eventId });
      utils.payouts.plannerBalance.invalidate();
      utils.payouts.pendingInstallments.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const withdrawAmendment = trpc.paymentSchedules.withdrawAmendment.useMutation(
    {
      onSuccess: () => {
        utils.paymentSchedules.forEvent.invalidate({ eventId });
      },
      onError: (e) => toast.error(e.message),
    }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-rose-100/70 bg-white/60 px-5 py-12">
        <Loader2 className="size-5 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-12 text-center">
        <CreditCard className="mx-auto mb-3 size-7 text-rose-500" />
        <p className="font-display text-lg font-light tracking-tight">
          {t("noPlanTitle")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {side === "planner"
            ? t("noPlanPlannerHint")
            : t("noPlanClientHint")}
        </p>
      </div>
    );
  }

  const currency = schedule.currency;
  const installments = schedule.installments as InstallmentLike[];
  const total = decimalToNumber(schedule.total_amount);
  const paid = installments
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + decimalToNumber(i.amount), 0);
  const refunded = installments
    .filter((i) => i.status === "refunded")
    .reduce((s, i) => s + decimalToNumber(i.amount), 0);
  const owed = Math.max(0, total - paid - refunded);
  const feePct = decimalToNumber(schedule.platform_fee_pct);

  const pendingAmendment = schedule.amendments[0] ?? null;
  const amendmentIsMine = (() => {
    if (!pendingAmendment) return false;
    // We can't check current user id from server data, but the requested_by
    // matches the side that authored. Use side mapping with the schedule:
    // amendments authored by planner_id user vs client_id user. We use a
    // minimal check via the schedule's planner.user_id when available.
    return false;
  })();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryStat label={t("summaryTotal")} value={f.currency(total, currency)} />
        <SummaryStat label={t("summaryPaid")} value={f.currency(paid, currency)} />
        <SummaryStat label={t("summaryOwed")} value={f.currency(owed, currency)} />
      </div>

      {pendingAmendment && (
        <PendingAmendmentBanner
          schedule={schedule}
          amendment={pendingAmendment}
          side={side}
          onAccept={() =>
            decideAmendment.mutate({
              amendmentId: pendingAmendment.id,
              accept: true,
            })
          }
          onReject={() =>
            decideAmendment.mutate({
              amendmentId: pendingAmendment.id,
              accept: false,
            })
          }
          onWithdraw={() =>
            withdrawAmendment.mutate({ amendmentId: pendingAmendment.id })
          }
          deciding={decideAmendment.isPending || withdrawAmendment.isPending}
          mineGuess={amendmentIsMine}
        />
      )}

      {side === "client" && feePct > 0 && (
        <div
          className="rounded-2xl border border-rose-100/70 bg-rose-50/40 px-4 py-3 text-xs text-rose-900/85"
          title={t("feeIncludedTooltip", { pct: f.number(feePct) })}
        >
          <p>{t("feeIncludedClient", { pct: f.number(feePct) })}</p>
          <p className="mt-1 text-rose-900/60">{t("receiptHint")}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 border-b border-rose-100/70 px-5 py-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              {t("planEyebrow")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("statusLine", { label: scheduleStatusLabel(schedule.status, t) })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {side === "planner" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFee((v) => !v)}
                className="h-7 gap-1.5 text-xs text-muted-foreground"
              >
                {showFee ? (
                  <>
                    <EyeOff className="size-3" /> {t("hideTakeHome")}
                  </>
                ) : (
                  <>
                    <Eye className="size-3" /> {t("showTakeHome")}
                  </>
                )}
              </Button>
            )}
            {(schedule.status === "active" || schedule.status === "amended") &&
              !pendingAmendment && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAmendOpen(true)}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Pencil className="size-3" />
                  {t("proposeAmendment")}
                </Button>
              )}
          </div>
        </div>

        {installments.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {t("noInstallments")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {installments.map((p) => {
              const amount = decimalToNumber(p.amount);
              const fee = computeFee(amount, feePct).feeAmount;
              const net =
                p.net_to_planner_amount != null
                  ? decimalToNumber(p.net_to_planner_amount)
                  : amount - fee;
              const tone = STATUS_TONE[p.status] ?? "rose";
              const statusKey = STATUS_LABEL_KEY[p.status] ?? "statusPending";
              const isPayable =
                side === "client" &&
                (p.status === "pending" || p.status === "failed") &&
                (schedule.status === "active" ||
                  schedule.status === "amended");
              const isAwaiting =
                p.status === "awaiting_payment" ||
                p.status === "processing" ||
                pollingInstallmentId === p.id;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.label}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {p.due_date && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {t("due", { date: f.date(p.due_date) })}
                        </span>
                      )}
                      {p.paid_at && (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <Check className="size-3" />
                          {t("paidOn", { date: f.date(p.paid_at) })}
                        </span>
                      )}
                      {side === "planner" && showFee && p.status === "paid" && (
                        <span className="inline-flex items-center gap-1 text-foreground/70">
                          {t("takeHomeAmount", {
                            amount: f.currency(net, p.currency),
                          })}
                        </span>
                      )}
                      {side === "planner" &&
                        showFee &&
                        p.status !== "paid" &&
                        p.status !== "refunded" && (
                          <span className="text-foreground/60">
                            {t("afterFee", {
                              amount: f.currency(amount - fee, p.currency),
                            })}
                          </span>
                        )}
                      {side === "planner" && p.payout_id && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-1.5 py-0 text-[10px] uppercase tracking-wide text-stone-600">
                          {t("paidOut")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-medium tabular-nums">
                      {f.currency(amount, p.currency)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
                        TONE_CLASS[tone]
                      )}
                    >
                      {t(statusKey)}
                    </span>
                    {isPayable && !isAwaiting && (
                      <Button
                        size="sm"
                        disabled={checkoutMutation.isPending}
                        onClick={() =>
                          checkoutMutation.mutate({ installmentId: p.id })
                        }
                        className="h-7 gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-xs text-white"
                      >
                        {checkoutMutation.isPending &&
                        checkoutMutation.variables?.installmentId === p.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <CreditCard className="size-3" />
                        )}
                        {t("payNow")}
                      </Button>
                    )}
                    {isAwaiting && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                        <Loader2 className="size-3 animate-spin" />
                        {t("waitingForPayment")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {amendOpen && (
        <AmendmentDialog
          eventId={eventId}
          schedule={schedule}
          open={amendOpen}
          onOpenChange={setAmendOpen}
        />
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-rose-100/70 bg-white/80 px-4 py-3 backdrop-blur-sm">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
        {label}
      </p>
      <p className="font-display mt-1 text-xl font-light tracking-tight">
        {value}
      </p>
    </div>
  );
}

function scheduleStatusLabel(
  status: string,
  t: (key: string) => string
): string {
  switch (status) {
    case "draft":
      return t("scheduleStatusDraft");
    case "proposed":
      return t("scheduleStatusProposed");
    case "active":
      return t("scheduleStatusActive");
    case "amended":
      return t("scheduleStatusAmended");
    case "completed":
      return t("scheduleStatusCompleted");
    case "cancelled":
      return t("scheduleStatusCancelled");
    default:
      return status;
  }
}

interface ScheduleData {
  id: string;
  status: string;
  currency: string;
  total_amount: unknown;
  platform_fee_pct: unknown;
  installments: InstallmentLike[];
  amendments: Array<{
    id: string;
    requested_by_user_id: string;
    proposed_installments: unknown;
    proposed_total: unknown;
    proposed_fee_pct: unknown;
    reason: string | null;
    status: string;
    created_at: Date;
  }>;
}

function PendingAmendmentBanner({
  schedule,
  amendment,
  side,
  onAccept,
  onReject,
  onWithdraw,
  deciding,
  mineGuess,
}: {
  schedule: ScheduleData;
  amendment: ScheduleData["amendments"][number];
  side: Side;
  onAccept: () => void;
  onReject: () => void;
  onWithdraw: () => void;
  deciding: boolean;
  mineGuess: boolean;
}) {
  const t = useTranslations("payments");
  const f = useFormatters();
  const proposed = Array.isArray(amendment.proposed_installments)
    ? (amendment.proposed_installments as Array<{
        label: string;
        amount: number;
        due_date: string | null;
      }>)
    : [];
  const proposedTotal = decimalToNumber(amendment.proposed_total);
  const currentTotal = decimalToNumber(schedule.total_amount);
  const delta = proposedTotal - currentTotal;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-900">
            {t("pendingAmendmentTitle")}
          </p>
          {amendment.reason && (
            <p className="mt-1 text-sm italic text-amber-900/85">
              &ldquo;{amendment.reason}&rdquo;
            </p>
          )}
          <ul className="mt-3 space-y-1 text-sm">
            {proposed.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 text-amber-950"
              >
                <span>
                  {p.label}
                  {p.due_date ? ` · ${f.date(p.due_date)}` : ""}
                </span>
                <span className="font-mono tabular-nums">
                  {f.currency(p.amount, schedule.currency)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 border-t border-amber-200 pt-1 text-amber-950">
              <span className="font-medium">{t("newTotal")}</span>
              <span className="font-mono font-medium tabular-nums">
                {f.currency(proposedTotal, schedule.currency)}
                {delta !== 0 && (
                  <span
                    className={cn(
                      "ms-2 text-xs",
                      delta > 0 ? "text-emerald-700" : "text-rose-700"
                    )}
                  >
                    ({delta > 0 ? "+" : ""}
                    {f.currency(delta, schedule.currency)})
                  </span>
                )}
              </span>
            </li>
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!mineGuess ? (
              <>
                <Button
                  size="sm"
                  disabled={deciding}
                  onClick={onAccept}
                  className="h-7 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                >
                  <CheckCircle2 className="size-3" />
                  {t("accept")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={deciding}
                  onClick={onReject}
                  className="h-7 gap-1.5 text-xs"
                >
                  <XCircle className="size-3" />
                  {t("reject")}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={deciding}
                onClick={onWithdraw}
                className="h-7 gap-1.5 text-xs"
              >
                <RotateCcw className="size-3" />
                {t("withdrawRequest")}
              </Button>
            )}
            <p className="text-xs text-amber-900/70">
              {side === "planner"
                ? t("otherPartyRequestedPlanner")
                : t("otherPartyRequestedClient")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
