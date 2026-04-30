"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Briefcase, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
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

export default function VendorEngagementsListPage() {
  const incoming = trpc.vendorEngagements.incoming.useQuery();

  if (incoming.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  const items = incoming.data ?? [];

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            Engagements
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
            Every deal in flight
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cancelled, accepted, completed — your full history with planners.
          </p>
        </header>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-12 text-center backdrop-blur-sm">
            <Briefcase className="mx-auto mb-3 size-8 text-rose-500" />
            <p className="font-display text-xl font-light tracking-tight">
              No engagements yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once a planner books items from your catalog, they&apos;ll show up
              here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((e) => (
              <li
                key={e.id}
                className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/85 backdrop-blur-sm"
              >
                <Link
                  href={`/dashboard/vendor/engagements/${e.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition hover:bg-rose-50/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium leading-tight">
                      {e.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.planner.business_name} · {e.event.title}
                      {e.event.event_date && (
                        <> · {format(new Date(e.event.event_date), "PP")}</>
                      )}
                      {" · "}
                      {e.items.length} line items
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        STATUS_TONE[e.status] ?? STATUS_TONE.draft
                      }`}
                    >
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>
                    <span className="font-mono text-sm tabular-nums">
                      {formatCurrency(
                        decimalToNumber(e.total_amount),
                        e.currency,
                      )}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
