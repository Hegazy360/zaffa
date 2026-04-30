"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
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
import { decimalToNumber, formatCurrency } from "@/lib/payments";

export default function AdminPayoutsPage() {
  const pending = trpc.admin.pendingPayouts.useQuery();
  const recent = trpc.admin.recentInstallments.useQuery({ limit: 25 });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          Payouts
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          Planner payouts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Planners with paid installments waiting to be paid out.
        </p>
      </header>

      {pending.data?.totals && pending.data.totals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {pending.data.totals.map((t) => (
            <div
              key={t.currency}
              className="rounded-2xl border border-rose-100/70 bg-white/80 px-5 py-4 backdrop-blur-sm"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                Total owed ({t.currency})
              </p>
              <p className="font-display mt-1 text-2xl font-light tracking-tight">
                {formatCurrency(t.net, t.currency)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Gross {formatCurrency(t.gross, t.currency)} · Fees{" "}
                {formatCurrency(t.fees, t.currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-rose-100/70 bg-white/80">
        <div className="border-b border-rose-100/70 px-5 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            Awaiting payout
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
              No outstanding planner balances right now.
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
                    {p.fullName} · {p.installmentCount} installments
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-mono tabular-nums">
                      {formatCurrency(p.net, p.currency)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Gross {formatCurrency(p.gross, p.currency)}
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

      <div className="rounded-2xl border border-rose-100/70 bg-white/80">
        <div className="border-b border-rose-100/70 px-5 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            Recent installments
          </p>
        </div>
        {recent.isLoading ? (
          <div className="px-5 py-8 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-rose-500" />
          </div>
        ) : (recent.data?.length ?? 0) === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No collected installments yet.
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
                    {p.paid_at && ` · ${format(new Date(p.paid_at), "PP")}`}
                    {p.disputed_at && (
                      <span className="ml-2 rounded bg-red-50 px-1 text-red-700">
                        disputed
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono tabular-nums">
                    {formatCurrency(decimalToNumber(p.amount), p.currency)}
                  </p>
                  <p className="text-[10px] capitalize text-muted-foreground">
                    {p.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
      toast.success("Payout recorded");
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
      toast.error("Select at least one installment");
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
            className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
          />
        }
      >
        Record payout
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record payout to {plannerName}</DialogTitle>
          <DialogDescription>
            Pick the installments this payout covers. They&apos;ll be locked
            to this payout once recorded.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="max-h-72 overflow-y-auto rounded-xl border border-rose-100/70">
            {installments.isLoading ? (
              <div className="px-5 py-8 text-center">
                <Loader2 className="mx-auto size-4 animate-spin text-rose-500" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                No eligible installments.
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
                          ` · ${format(new Date(i.paid_at), "PP")}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono tabular-nums">
                        {formatCurrency(
                          decimalToNumber(i.net_to_planner_amount),
                          i.currency
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Gross{" "}
                        {formatCurrency(decimalToNumber(i.amount), i.currency)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="method">Method</Label>
              <select
                id="method"
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as typeof method)
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="instapay">Instapay</option>
                <option value="wire">Wire</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paid-at">Paid at</Label>
              <Input
                id="paid-at"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction id"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Payout total</span>
            <span className="font-mono tabular-nums">
              {formatCurrency(totalNet, currency)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={record.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={record.isPending}
              className="bg-gradient-to-r from-rose-600 to-amber-500 text-white"
            >
              {record.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Record payout
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
