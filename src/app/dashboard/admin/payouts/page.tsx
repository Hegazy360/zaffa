"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decimalToNumber } from "@/lib/payments";

import { useFormatters } from "@/lib/use-formatters";
export default function AdminPayoutsPage() {
  const pending = trpc.admin.pendingPayouts.useQuery();
  const f = useFormatters();
  const t = useTranslations("admin");
  const recent = trpc.admin.recentInstallments.useQuery({ limit: 25 });
  const disputes = trpc.admin.disputes.useQuery();

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          {t("payoutsEyebrow")}
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          {t("plannerPayoutsHeader")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("plannerPayoutsSubtitle")}
        </p>
      </header>

      {pending.data?.totals && pending.data.totals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {pending.data.totals.map((row) => (
            <div
              key={row.currency}
              className="rounded-2xl border border-brand-line bg-white/80 px-5 py-4 backdrop-blur-sm"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                {t("totalOwed", { currency: row.currency })}
              </p>
              <p className="font-display mt-1 text-2xl font-light tracking-tight">
                {f.currency(row.net, row.currency)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("grossFees", {
                  gross: f.currency(row.gross, row.currency),
                  fees: f.currency(row.fees, row.currency),
                })}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-brand-line bg-white/80">
        <div className="border-b border-brand-line px-5 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            {t("awaitingPayout")}
          </p>
        </div>
        {pending.isLoading ? (
          <div className="px-5 py-12 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-rose-500" />
          </div>
        ) : (pending.data?.planners.length ?? 0) === 0 ? (
          <div className="px-5 py-12 text-center">
            <Wallet className="mx-auto mb-2 size-6 text-rose-500" />
            <p className="text-sm text-muted-foreground">
              {t("noPlannerBalances")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {pending.data!.planners.map((p) => (
              <li
                key={`${p.plannerId}-${p.currency}`}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{p.businessName}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.fullName} ·{" "}
                    {t("installmentsCount", { count: p.installmentCount })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-end">
                    <p className="font-mono tabular-nums">
                      {f.currency(p.net, p.currency)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t("grossPrefix", {
                        amount: f.currency(p.gross, p.currency),
                      })}
                    </p>
                  </div>
                  <RecordPayoutDialog
                    plannerId={p.plannerId}
                    plannerName={p.businessName}
                    currency={p.currency}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-red-200/70 bg-red-50/40">
        <div className="flex items-center gap-2 border-b border-red-200/70 px-5 py-3">
          <AlertTriangle className="size-4 text-red-700" aria-hidden />
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-red-700">
            {t("openDisputes")}
          </p>
        </div>
        {disputes.isLoading ? (
          <div className="px-5 py-6 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-red-700" />
          </div>
        ) : (disputes.data?.length ?? 0) === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">
            {t("noDisputes")}
          </p>
        ) : (
          <ul className="divide-y divide-red-200/70 text-sm">
            {disputes.data!.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.schedule?.planner?.business_name}
                    {d.disputed_at &&
                      ` · ${t("disputeOpened", { date: f.date(d.disputed_at, "medium") })}`}
                    {d.dispute_status &&
                      ` · ${t("disputeStatus", { status: d.dispute_status })}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-mono tabular-nums">
                    {f.currency(decimalToNumber(d.amount), d.currency)}
                  </p>
                  <RefundDialog
                    paymentId={d.id}
                    label={d.event.title}
                    currency={d.currency}
                    gross={decimalToNumber(d.amount)}
                    refunded={0}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-brand-line bg-white/80">
        <div className="border-b border-brand-line px-5 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            {t("recentInstallments")}
          </p>
        </div>
        {recent.isLoading ? (
          <div className="px-5 py-8 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-rose-500" />
          </div>
        ) : (recent.data?.length ?? 0) === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {t("noInstallments")}
          </p>
        ) : (
          <ul className="divide-y divide-rose-100/70 text-sm">
            {recent.data!.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-medium">{p.label}</span> ·{" "}
                    <span className="text-muted-foreground">
                      {p.event.title}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.schedule?.planner.business_name}
                    {p.paid_at && ` · ${f.date(p.paid_at, "medium")}`}
                    {p.disputed_at && (
                      <span className="ms-2 rounded bg-red-50 px-1 text-red-700">
                        {t("disputed")}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-end">
                    <p className="font-mono tabular-nums">
                      {f.currency(decimalToNumber(p.amount), p.currency)}
                    </p>
                    <p className="text-[10px] capitalize text-muted-foreground">
                      {p.status}
                    </p>
                  </div>
                  {p.status === "paid" || p.status === "partially_refunded" ? (
                    <RefundDialog
                      paymentId={p.id}
                      label={`${p.label} · ${p.event.title}`}
                      currency={p.currency}
                      gross={decimalToNumber(p.amount)}
                      refunded={decimalToNumber(p.refunded_amount ?? 0)}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RefundDialog({
  paymentId,
  label,
  currency,
  gross,
  refunded,
}: {
  paymentId: string;
  label: string;
  currency: string;
  gross: number;
  refunded: number;
}) {
  const t = useTranslations("admin");
  const utils = trpc.useUtils();
  const f = useFormatters();
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, gross - refunded);
  const [amount, setAmount] = useState<string>(remaining.toFixed(2));
  const [reason, setReason] = useState<
    "requested_by_customer" | "duplicate" | "fraudulent"
  >("requested_by_customer");
  const [notes, setNotes] = useState("");

  const refund = trpc.admin.refundPayment.useMutation({
    onSuccess: (res) => {
      toast.success(
        t("refundIssuedToast", {
          amount: f.currency(res.refundedAmount, currency),
        }),
      );
      utils.admin.disputes.invalidate();
      utils.admin.recentInstallments.invalidate();
      utils.admin.pendingPayouts.invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error(t("refundAmount"));
      return;
    }
    refund.mutate({
      paymentId,
      amount: parsed,
      reason,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="outline" className="gap-1.5" />}
      >
        {t("issueRefund")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("refundDialogTitle", { label })}</DialogTitle>
          <DialogDescription>{t("refundDialogDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">{t("refundAmount")}</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min={0.01}
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("refundAmountHelp", {
                remaining: remaining.toFixed(2),
                currency,
              })}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">{t("refundReason")}</Label>
            <select
              id="reason"
              value={reason}
              onChange={(e) =>
                setReason(e.target.value as typeof reason)
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="requested_by_customer">
                {t("refundReasonRequested")}
              </option>
              <option value="duplicate">{t("refundReasonDuplicate")}</option>
              <option value="fraudulent">{t("refundReasonFraudulent")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-notes">{t("refundNotes")}</Label>
            <Textarea
              id="refund-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={refund.isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={refund.isPending}
              className="bg-red-700 text-white hover:bg-red-800"
            >
              {refund.isPending ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : null}
              {t("refundConfirm", {
                amount: f.currency(Number(amount) || 0, currency),
              })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordPayoutDialog({
  plannerId,
  plannerName,
  currency,
}: {
  plannerId: string;
  plannerName: string;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const f = useFormatters();
  const t = useTranslations("admin");
  const installments = trpc.admin.plannerPending.useQuery(
    { plannerId },
    { enabled: open }
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<"instapay" | "wire" | "cash" | "other">(
    "instapay"
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));

  const record = trpc.admin.recordPayout.useMutation({
    onSuccess: () => {
      toast.success(t("payoutRecordedToast"));
      utils.admin.pendingPayouts.invalidate();
      utils.admin.plannerPending.invalidate({ plannerId });
      setOpen(false);
      setSelected({});
      setReference("");
      setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (installments.data ?? []).filter(
    (i) => i.currency === currency
  );
  const totalNet = filtered
    .filter((i) => selected[i.id])
    .reduce((s, i) => s + decimalToNumber(i.net_to_planner_amount), 0);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([id]) => id);
    if (ids.length === 0) {
      toast.error(t("selectInstallment"));
      return;
    }
    record.mutate({
      plannerId,
      installmentIds: ids,
      currency,
      method,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      paid_at: new Date(paidAt),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            className="gap-1.5 bg-brand-gradient text-white"
          />
        }
      >
        {t("recordPayout")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("recordPayoutTo", { name: plannerName })}</DialogTitle>
          <DialogDescription>
            {t("recordPayoutDesc")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="max-h-72 overflow-y-auto rounded-xl border border-brand-line">
            {installments.isLoading ? (
              <div className="px-5 py-8 text-center">
                <Loader2 className="mx-auto size-4 animate-spin text-rose-500" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                {t("noEligibleInstallments")}
              </p>
            ) : (
              <ul className="divide-y divide-rose-100/70 text-sm">
                {filtered.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center gap-3 px-4 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[i.id]}
                      onChange={(e) =>
                        setSelected((s) => ({
                          ...s,
                          [i.id]: e.target.checked,
                        }))
                      }
                      className="size-4 accent-rose-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {i.event.title}
                        {i.paid_at &&
                          ` · ${f.date(i.paid_at, "medium")}`}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="font-mono tabular-nums">
                        {f.currency(
                          decimalToNumber(i.net_to_planner_amount),
                          i.currency
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {t("grossPrefix", {
                          amount: f.currency(
                            decimalToNumber(i.amount),
                            i.currency
                          ),
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="method">{t("method")}</Label>
              <select
                id="method"
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as typeof method)
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="instapay">{t("methodInstapay")}</option>
                <option value="wire">{t("methodWire")}</option>
                <option value="cash">{t("methodCash")}</option>
                <option value="other">{t("methodOther")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paid-at">{t("paidAt")}</Label>
              <Input
                id="paid-at"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">{t("reference")}</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("referencePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("payoutTotal")}</span>
            <span className="font-mono tabular-nums">
              {f.currency(totalNet, currency)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={record.isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={record.isPending}
              className="bg-brand-gradient text-white"
            >
              {record.isPending ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : null}
              {t("recordPayout")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
