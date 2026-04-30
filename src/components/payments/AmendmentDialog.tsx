"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decimalToNumber, formatCurrency } from "@/lib/payments";

interface ScheduleSummary {
  id: string;
  currency: string;
  total_amount: unknown;
  platform_fee_pct: unknown;
  installments: Array<{
    id: string;
    label: string;
    amount: unknown;
    status: string;
    due_date: Date | string | null;
  }>;
}

const OPEN_STATUSES = new Set([
  "pending",
  "awaiting_payment",
  "failed",
]);

interface Row {
  label: string;
  amount: string;
  due_date: string;
}

export function AmendmentDialog({
  eventId,
  schedule,
  open,
  onOpenChange,
}: {
  eventId: string;
  schedule: ScheduleSummary;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const utils = trpc.useUtils();
  // Hydrate the editor from the not-yet-paid installments. Already-paid
  // (or refunded) rows are immutable and must not be in the amendment.
  const initial = useMemo<Row[]>(() => {
    return schedule.installments
      .filter((i) => OPEN_STATUSES.has(i.status))
      .map((i) => ({
        label: i.label,
        amount: String(decimalToNumber(i.amount)),
        due_date: i.due_date
          ? new Date(i.due_date).toISOString().slice(0, 10)
          : "",
      }));
  }, [schedule.installments]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [reason, setReason] = useState("");

  const lockedPaid = schedule.installments
    .filter((i) => !OPEN_STATUSES.has(i.status))
    .filter((i) => i.status === "paid" || i.status === "refunded");
  const lockedTotal = lockedPaid.reduce(
    (s, i) => s + decimalToNumber(i.amount),
    0
  );
  const proposedOpenTotal = rows.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0
  );
  const proposedTotal = lockedTotal + proposedOpenTotal;

  const request = trpc.paymentSchedules.requestAmendment.useMutation({
    onSuccess: () => {
      toast.success("Amendment sent for review");
      utils.paymentSchedules.forEvent.invalidate({ eventId });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = rows
      .map((r) => ({
        label: r.label.trim(),
        amount: Number(r.amount) || 0,
        due_date: r.due_date ? new Date(r.due_date) : null,
      }))
      .filter((r) => r.label.length > 0 && r.amount > 0);
    if (cleaned.length === 0) {
      toast.error("Add at least one installment");
      return;
    }
    request.mutate({
      scheduleId: schedule.id,
      installments: cleaned,
      reason: reason.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Propose an amendment</DialogTitle>
          <DialogDescription>
            Edit the not-yet-paid installments. Already-paid rows stay locked.
            The other party reviews and accepts before it takes effect.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {lockedPaid.length > 0 && (
            <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-3 text-xs">
              <p className="mb-1 font-medium uppercase tracking-wide text-stone-600">
                Locked (already paid)
              </p>
              <ul className="space-y-0.5 text-stone-700">
                {lockedPaid.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span>{p.label}</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(
                        decimalToNumber(p.amount),
                        schedule.currency
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <Label>New installments</Label>
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <Input
                  className="col-span-5"
                  placeholder="Final"
                  value={row.label}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, i) =>
                        i === idx ? { ...r, label: e.target.value } : r
                      )
                    )
                  }
                />
                <Input
                  className="col-span-3"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={row.amount}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, i) =>
                        i === idx ? { ...r, amount: e.target.value } : r
                      )
                    )
                  }
                />
                <Input
                  className="col-span-3"
                  type="date"
                  value={row.due_date}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, i) =>
                        i === idx ? { ...r, due_date: e.target.value } : r
                      )
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="col-span-1"
                  onClick={() =>
                    setRows((rs) => rs.filter((_, i) => i !== idx))
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setRows((rs) => [
                  ...rs,
                  { label: "", amount: "", due_date: "" },
                ])
              }
              className="gap-1"
            >
              <Plus className="size-3" />
              Add installment
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="amend-reason">Why are you amending?</Label>
            <Textarea
              id="amend-reason"
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional but helpful — e.g. moved the event, scope changed."
            />
          </div>

          <div className="rounded-xl border border-rose-100/70 bg-rose-50/40 px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Locked subtotal</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(lockedTotal, schedule.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">New open subtotal</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(proposedOpenTotal, schedule.currency)}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-rose-100/60 pt-1 font-medium">
              <span>Proposed new total</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(proposedTotal, schedule.currency)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={request.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={request.isPending}
              className="bg-gradient-to-r from-rose-600 to-amber-500 text-white"
            >
              {request.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Send for review
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
