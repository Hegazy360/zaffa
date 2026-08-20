"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Mail, Phone, Inbox } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { LeadQualityCard } from "./_components/lead-quality-card";

/**
 * The concierge sales pipeline.
 *
 * List-first with status tabs rather than a drag-and-drop board: there is one
 * operator, and tabs give the board view for free without the drag machinery.
 *
 * Copy is English, matching the other seventeen admin pages. The i18n split
 * applies to customer-facing surfaces; translating an internal console the
 * founder reads in English would be cost without benefit.
 */

const PIPELINE = [
  "new",
  "contacted",
  "call_scheduled",
  "quote_sent",
  "accepted",
  "deposit_paid",
  "in_planning",
  "delivered",
  "lost",
] as const;

type Status = (typeof PIPELINE)[number];

const LABEL: Record<Status, string> = {
  new: "New",
  contacted: "Contacted",
  call_scheduled: "Call booked",
  quote_sent: "Quote sent",
  accepted: "Accepted",
  deposit_paid: "Deposit paid",
  in_planning: "In planning",
  delivered: "Delivered",
  lost: "Lost",
};

const CHANNEL_ICON = {
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
} as const;

export default function AdminEnquiriesPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const counts = trpc.enquiries.counts.useQuery();
  const list = trpc.enquiries.list.useQuery({ status: status ?? undefined, limit: 100 });

  const rows = list.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs text-eyebrow text-muted-foreground">
          Pipeline
        </p>
        <h1 className="mt-1 font-display text-3xl font-light tracking-tight">
          Enquiries
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every full-service enquiry, newest first. Reply fast - latency is
          where these deals die.
        </p>
      </header>

      {/* The number that has to be watched after publishing our fee: volume
          is expected to fall while quality rises, and only one of those is
          visible from the list below. */}
      <LeadQualityCard />

      {/* Status tabs. `aria-current` carries the selection so it isn't
          communicated by colour alone. */}
      <nav aria-label="Filter by pipeline status" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-current={status === null ? "true" : undefined}
          onClick={() => setStatus(null)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs transition-colors",
            status === null
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : "border-brand-line hover:border-rose-200",
          )}
        >
          All
        </button>
        {PIPELINE.map((s) => {
          const n = counts.data?.[s] ?? 0;
          return (
            <button
              key={s}
              type="button"
              aria-current={status === s ? "true" : undefined}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                status === s
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-brand-line hover:border-rose-200",
                n === 0 && "text-muted-foreground",
              )}
            >
              {LABEL[s]}
              {n > 0 && <span className="ms-1.5 font-medium">{n}</span>}
            </button>
          );
        })}
      </nav>

      {list.isLoading ? (
        <div className="space-y-2" aria-live="polite" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-stone-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rose-200 px-6 py-16 text-center">
          <Inbox className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {status
              ? "No enquiries in this stage."
              : "New enquiries from /enquire will land here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((e) => {
            const Icon =
              CHANNEL_ICON[e.preferred_channel as keyof typeof CHANNEL_ICON] ??
              Mail;
            return (
              <li key={e.id} className="relative">
                <div className="flex items-start gap-3 rounded-2xl border border-brand-line p-4 transition-colors hover:border-rose-200 focus-within:ring-2 focus-within:ring-rose-300">
                  {/* A design_approved lead IS its render, show it on the
                      row so the operator recognises the wedding at a glance. */}
                  {e.design?.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-only inbox chip, tiny fixed size, Cloudinary thumb already sized
                    <img
                      src={e.design.thumbnail}
                      alt=""
                      className="size-12 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-medium">
                      {/* Link overlay: the whole card is clickable, but it's a
                          real anchor so middle-click and long-press-share work. */}
                      <Link
                        href={`/dashboard/admin/enquiries/${e.id}`}
                        className="outline-none after:absolute after:inset-0 after:content-['']"
                      >
                        {e.full_name}
                      </Link>
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(e.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Icon className="size-3.5" />
                      {e.preferred_channel}
                    </span>
                    {(e.city || e.country) && (
                      <span>{[e.city, e.country].filter(Boolean).join(", ")}</span>
                    )}
                    {e.guest_band && <span>{e.guest_band}</span>}
                    {e.budget_band && (
                      <span>
                        <bdi>
                          {e.budget_band}
                          {e.budget_currency ? ` ${e.budget_currency}` : ""}
                        </bdi>
                      </span>
                    )}
                    <span className="rounded-full bg-stone-100 px-2 py-0.5">
                      {LABEL[e.status as Status]}
                    </span>
                    {e.source === "design_approved" && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
                        Approved their design
                      </span>
                    )}
                  </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
