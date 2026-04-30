"use client";

import { use } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { decimalToNumber, formatCurrency } from "@/lib/payments";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  requested: "Awaiting your response",
  accepted: "Accepted",
  declined: "Declined",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  requested: "bg-rose-100 text-rose-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-stone-100 text-stone-700",
  active: "bg-amber-100 text-amber-900",
  completed: "bg-stone-100 text-stone-700",
  cancelled: "bg-stone-100 text-stone-500",
};

const RELEASE_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-stone-100 text-stone-500",
};

export default function VendorEngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const detail = trpc.vendorEngagements.byId.useQuery({ id });
  const respond = trpc.vendorEngagements.vendorRespond.useMutation({
    onSuccess: () => {
      toast.success("Response sent");
      utils.vendorEngagements.byId.invalidate({ id });
      utils.vendorEngagements.incoming.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancel = trpc.vendorEngagements.cancel.useMutation({
    onSuccess: () => {
      toast.success("Engagement cancelled");
      utils.vendorEngagements.byId.invalidate({ id });
      utils.vendorEngagements.incoming.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const markDelivered = trpc.vendorEngagements.markItemDelivered.useMutation({
    onSuccess: () => {
      utils.vendorEngagements.byId.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Engagement not found.</p>
      </div>
    );
  }

  const e = detail.data;
  const status = e.status;
  const totalReleased = e.releases
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + Number(r.amount), 0);
  const totalCommitted = e.releases
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative z-10 mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        <Link
          href="/dashboard/vendor/engagements"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-rose-700"
        >
          <ArrowLeft className="size-3" />
          Back to engagements
        </Link>

        <header className="space-y-3 rounded-2xl border border-rose-100/70 bg-white/85 p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
                Engagement
              </p>
              <h1 className="font-display mt-1 text-2xl font-light tracking-tight sm:text-3xl">
                {e.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {e.planner.business_name} · {e.event.title}
                {e.event.event_date && (
                  <> · {format(new Date(e.event.event_date), "PP")}</>
                )}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-wider ${
                STATUS_TONE[status]
              }`}
            >
              {STATUS_LABEL[status] ?? status}
            </span>
          </div>
          {e.notes && (
            <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">
              {e.notes}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Total{" "}
              <span className="ml-1 font-mono tabular-nums text-foreground">
                {formatCurrency(decimalToNumber(e.total_amount), e.currency)}
              </span>
            </span>
            <span>·</span>
            <span>
              Released{" "}
              <span className="ml-1 font-mono tabular-nums text-foreground">
                {formatCurrency(totalReleased, e.currency)}
              </span>
            </span>
            {totalCommitted > 0 && (
              <>
                <span>·</span>
                <span>
                  Committed{" "}
                  <span className="ml-1 font-mono tabular-nums text-foreground">
                    {formatCurrency(totalCommitted, e.currency)}
                  </span>
                </span>
              </>
            )}
          </div>
          {status === "requested" && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-rose-100/70 pt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate({ id: e.id, accept: false })
                }
                className="gap-1"
              >
                <X className="size-3.5" />
                Decline
              </Button>
              <Button
                size="sm"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ id: e.id, accept: true })}
                className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
              >
                {respond.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                Accept request
              </Button>
            </div>
          )}
          {(status === "accepted" || status === "active") && (
            <div className="flex justify-end border-t border-rose-100/70 pt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={cancel.isPending}
                onClick={() => {
                  const reason = prompt(
                    "Reason for cancelling? The planner will see this.",
                  );
                  if (reason !== null) {
                    cancel.mutate({ id: e.id, reason: reason || undefined });
                  }
                }}
                className="gap-1 text-destructive"
              >
                <X className="size-3.5" />
                Cancel engagement
              </Button>
            </div>
          )}
        </header>

        <section className="rounded-2xl border border-rose-100/70 bg-white/85 backdrop-blur-sm">
          <div className="border-b border-rose-100/70 px-5 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              Line items
            </p>
          </div>
          <ul className="divide-y divide-rose-100/70">
            {e.items.map((i) => {
              const delivered = i.delivered_at != null;
              const canToggle = ["accepted", "active", "completed"].includes(
                status,
              );
              return (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.name}</p>
                    {i.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {i.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      ×{i.quantity} ·{" "}
                      <span className="font-mono tabular-nums">
                        {formatCurrency(
                          decimalToNumber(i.unit_price),
                          e.currency,
                        )}
                      </span>{" "}
                      ea
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm tabular-nums">
                      {formatCurrency(
                        decimalToNumber(i.line_total),
                        e.currency,
                      )}
                    </span>
                    {canToggle && (
                      <Button
                        variant={delivered ? "secondary" : "outline"}
                        size="sm"
                        disabled={markDelivered.isPending}
                        onClick={() =>
                          markDelivered.mutate({
                            engagement_id: e.id,
                            item_id: i.id,
                            delivered: !delivered,
                          })
                        }
                        className="gap-1"
                      >
                        {delivered ? (
                          <>
                            <PackageCheck className="size-3.5" />
                            Delivered
                          </>
                        ) : (
                          <>
                            <Clock className="size-3.5" />
                            Mark delivered
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl border border-rose-100/70 bg-white/85 backdrop-blur-sm">
          <div className="border-b border-rose-100/70 px-5 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              Releases
            </p>
            <p className="text-xs text-muted-foreground">
              Funds the planner has earmarked from their balance to you.
              Admin pays them out off-Stripe.
            </p>
          </div>
          {e.releases.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No releases yet.
            </div>
          ) : (
            <ul className="divide-y divide-rose-100/70">
              {e.releases.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested {format(new Date(r.requested_at), "PP")}
                      {r.paid_at && (
                        <> · Paid {format(new Date(r.paid_at), "PP")}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        RELEASE_TONE[r.status] ?? RELEASE_TONE.pending
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="font-mono text-sm tabular-nums">
                      {formatCurrency(decimalToNumber(r.amount), r.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
