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

export default function AdminVendorPayoutsPage() {
  const pending = trpc.admin.pendingVendorPayouts.useQuery();

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          Vendor payouts
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          Vendor releases
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vendors with pending releases that planners have committed but
          haven&apos;t been paid out yet.
        </p>
      </header>

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
        ) : (pending.data?.vendors.length ?? 0) === 0 ? (
          <div className="px-5 py-12 text-center">
            <Wallet className="mx-auto mb-2 size-6 text-rose-500" />
            <p className="text-sm text-muted-foreground">
              No pending vendor releases right now.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {pending.data!.vendors.map((v) => (
              <li
                key={`${v.vendorId}-${v.currency}`}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{v.businessName}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {v.fullName} · {v.category} · {v.releases.length} releases
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-mono tabular-nums">
                      {formatCurrency(v.total, v.currency)}
                    </p>
                  </div>
                  <RecordVendorPayoutDialog
                    vendorId={v.vendorId}
                    vendorName={v.businessName}
                    currency={v.currency}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RecordVendorPayoutDialog({
  vendorId,
  vendorName,
  currency,
}: {
  vendorId: string;
  vendorName: string;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const releases = trpc.admin.vendorPending.useQuery(
    { vendorId },
    { enabled: open },
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<"instapay" | "wire" | "cash" | "other">(
    "instapay",
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const record = trpc.admin.recordVendorPayout.useMutation({
    onSuccess: () => {
      toast.success("Vendor payout recorded");
      utils.admin.pendingVendorPayouts.invalidate();
      utils.admin.vendorPending.invalidate({ vendorId });
      setOpen(false);
      setSelected({});
      setReference("");
      setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (releases.data ?? []).filter(
    (r) => r.currency === currency,
  );
  const total = filtered
    .filter((r) => selected[r.id])
    .reduce((s, r) => s + decimalToNumber(r.amount), 0);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([id]) => id);
    if (ids.length === 0) {
      toast.error("Select at least one release");
      return;
    }
    record.mutate({
      vendorId,
      releaseIds: ids,
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
          <DialogTitle>Record payout to {vendorName}</DialogTitle>
          <DialogDescription>
            Pick the releases this payout covers. They&apos;ll be flipped to
            paid and locked to this Payout row.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="max-h-72 overflow-y-auto rounded-xl border border-rose-100/70">
            {releases.isLoading ? (
              <div className="px-5 py-8 text-center">
                <Loader2 className="mx-auto size-4 animate-spin text-rose-500" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                No eligible releases.
              </p>
            ) : (
              <ul className="divide-y divide-rose-100/70 text-sm">
                {filtered.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={(e) =>
                        setSelected((s) => ({
                          ...s,
                          [r.id]: e.target.checked,
                        }))
                      }
                      className="size-4 accent-rose-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.engagement.title} · {r.planner.business_name}
                        {r.requested_at &&
                          ` · Requested ${format(new Date(r.requested_at), "PP")}`}
                      </p>
                    </div>
                    <p className="font-mono text-right tabular-nums">
                      {formatCurrency(decimalToNumber(r.amount), r.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vmethod">Method</Label>
              <select
                id="vmethod"
                value={method}
                onChange={(e) =>
                  setMethod(
                    e.target.value as "instapay" | "wire" | "cash" | "other",
                  )
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
              <Label htmlFor="vpaid">Paid at</Label>
              <Input
                id="vpaid"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="vref">Reference</Label>
              <Input
                id="vref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Bank transfer #, Instapay note, etc."
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="vnotes">Notes</Label>
              <Textarea
                id="vnotes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-rose-100/70 bg-rose-50/40 px-4 py-2">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="font-mono tabular-nums">
              {formatCurrency(total, currency)}
            </span>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={record.isPending}
              className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
            >
              {record.isPending && <Loader2 className="size-4 animate-spin" />}
              Record payout
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
