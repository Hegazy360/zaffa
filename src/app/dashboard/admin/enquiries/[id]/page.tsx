"use client";

import { use, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { waLinkFor } from "@/lib/contact-channels";
import { quoteGuidanceFor, currencyForCountry } from "@/lib/concierge-pricing";

/**
 * Working view for a single enquiry: context, pipeline moves, notes, and the
 * quote. English copy, matching the rest of the admin console.
 */

const LABEL: Record<string, string> = {
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

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

export default function EnquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const q = trpc.enquiries.byId.useQuery({ id });

  const [note, setNote] = useState("");
  const [total, setTotal] = useState("");
  const [deposit, setDeposit] = useState("");
  const [copied, setCopied] = useState(false);

  const invalidate = () => {
    void utils.enquiries.byId.invalidate({ id });
    void utils.enquiries.counts.invalidate();
    void utils.enquiries.list.invalidate();
  };

  const updateStatus = trpc.enquiries.updateStatus.useMutation({ onSuccess: invalidate });
  const addNote = trpc.enquiries.addNote.useMutation({
    onSuccess: () => {
      setNote("");
      invalidate();
    },
  });
  const convert = trpc.enquiries.convertToEvent.useMutation({ onSuccess: invalidate });
  const createQuote = trpc.enquiries.createQuote.useMutation({ onSuccess: invalidate });

  if (q.isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-stone-100" />;
  }
  if (!q.data) return <p className="text-sm">Not found.</p>;

  const e = q.data;
  const currency = e.quoted_currency ?? currencyForCountry(e.country);
  const guidance = quoteGuidanceFor(e.country);
  const wa = waLinkFor(
    e.phone,
    `Hi ${e.full_name.split(" ")[0]}, it's Zaffa — thank you for telling us about your wedding.`,
  );

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/admin/enquiries"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:-scale-x-100" />
        All enquiries
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-light tracking-tight">
            {e.full_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[e.city, e.country].filter(Boolean).join(", ") || "Location not given"}
            {" · "}
            {format(new Date(e.created_at), "d MMM yyyy")}
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium">
          {LABEL[e.status] ?? e.status}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Pipeline moves. Only legal transitions render — the router
              rejects the rest, so the UI never offers a dead button. */}
          <section className="rounded-2xl border border-brand-line p-4">
            <h2 className="text-sm font-medium">Move it along</h2>
            {e.allowedNext.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                This enquiry is closed.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {e.allowedNext.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === "lost" ? "outline" : "default"}
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ id, status: s })}
                    className={cn(s !== "lost" && "bg-rose-600 text-white hover:bg-rose-700")}
                  >
                    {LABEL[s] ?? s}
                  </Button>
                ))}
              </div>
            )}
          </section>

          {/* Quote. Guidance comes from the internal band model; unpriced
              markets say so rather than showing an invented number. */}
          <section className="rounded-2xl border border-brand-line p-4">
            <h2 className="text-sm font-medium">Quote</h2>
            {guidance ? (
              <div className="mt-2 rounded-xl bg-stone-50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  Guidance for {guidance.country}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {guidance.bands.map((b, i) => (
                    <li key={i}>
                      <bdi>
                        {money(b.budgetFrom, guidance.currency)}–
                        {money(b.budgetTo, guidance.currency)} → fee{" "}
                        <strong className="text-foreground">
                          {money(b.fee, guidance.currency)}
                        </strong>
                      </bdi>
                    </li>
                  ))}
                </ul>
                <p className="mt-1">
                  Cap <bdi>{money(guidance.cap, guidance.currency)}</bdi>. Every
                  band is 15% at its floor and 10% at its ceiling.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                No band table for this market — quote bespoke. Currency defaults
                to {currency}.
              </p>
            )}

            {!e.event_id ? (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">
                  Create the event first — the quote attaches to it.
                </p>
                <Button
                  size="sm"
                  disabled={convert.isPending}
                  onClick={() => convert.mutate({ id })}
                  className="mt-2 gap-2 bg-rose-600 text-white hover:bg-rose-700"
                >
                  {convert.isPending && <Loader2 className="size-4 animate-spin" />}
                  Accept &amp; create event
                </Button>
                {convert.error && (
                  <p role="alert" className="mt-2 text-xs text-rose-700">
                    {convert.error.message}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="q-total">Total fee ({currency})</Label>
                    <Input
                      id="q-total"
                      inputMode="decimal"
                      value={total}
                      onChange={(ev) => setTotal(ev.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="q-deposit">Deposit ({currency})</Label>
                    <Input
                      id="q-deposit"
                      inputMode="decimal"
                      value={deposit}
                      onChange={(ev) => setDeposit(ev.target.value)}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      25–50% is the industry norm.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={
                    createQuote.isPending ||
                    !Number(total) ||
                    !Number(deposit)
                  }
                  onClick={() =>
                    createQuote.mutate({
                      id,
                      total: Number(total),
                      depositAmount: Number(deposit),
                      currency,
                    })
                  }
                  className="gap-2 bg-rose-600 text-white hover:bg-rose-700"
                >
                  {createQuote.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Create quote &amp; payment link
                </Button>
                {createQuote.error && (
                  <p role="alert" className="text-xs text-rose-700">
                    {createQuote.error.message}
                  </p>
                )}
                {createQuote.data?.paymentLinkUrl && (
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-xs font-medium">Deposit link</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {createQuote.data.paymentLinkUrl}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            createQuote.data!.paymentLinkUrl,
                          );
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                      {e.phone && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          render={
                            <a
                              href={
                                waLinkFor(
                                  e.phone,
                                  `Here's the deposit link for your wedding: ${createQuote.data.paymentLinkUrl}`,
                                ) ?? "#"
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          }
                        >
                          <MessageCircle className="size-3.5" />
                          Send on WhatsApp
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="rounded-2xl border border-brand-line p-4">
            <h2 className="text-sm font-medium">Notes</h2>
            <Textarea
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              rows={3}
              placeholder="What came out of the call?"
              className="mt-2"
            />
            <Button
              size="sm"
              disabled={!note.trim() || addNote.isPending}
              onClick={() => addNote.mutate({ enquiryId: id, body: note.trim() })}
              className="mt-2"
              variant="outline"
            >
              Add note
            </Button>
            <ul className="mt-4 space-y-3">
              {e.notes.map((n) => (
                <li key={n.id} className="border-s-2 border-brand-line ps-3">
                  <p className="text-sm">{n.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.author?.full_name ?? "—"} ·{" "}
                    {format(new Date(n.created_at), "d MMM, HH:mm")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Context rail */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-brand-line p-4">
            <h2 className="text-sm font-medium">Reach them</h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Prefers</dt>
                <dd>{e.preferred_channel}</dd>
              </div>
              {e.phone && (
                <div>
                  <dt className="text-xs text-muted-foreground">WhatsApp</dt>
                  <dd dir="ltr">{e.phone}</dd>
                </div>
              )}
              {e.email && (
                <div>
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd className="break-all" dir="ltr">
                    {e.email}
                  </dd>
                </div>
              )}
            </dl>
            {wa && (
              <Button
                size="sm"
                className="mt-3 w-full gap-1.5 bg-[#25D366] text-white hover:opacity-90"
                render={<a href={wa} target="_blank" rel="noopener noreferrer" />}
              >
                <MessageCircle className="size-4" />
                Open WhatsApp
              </Button>
            )}
          </section>

          <section className="rounded-2xl border border-brand-line p-4">
            <h2 className="text-sm font-medium">Their day</h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">When</dt>
                <dd>
                  {e.event_date
                    ? format(new Date(e.event_date), "d MMM yyyy")
                    : e.date_flexible
                      ? "Still deciding"
                      : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Guests</dt>
                <dd>{e.guest_band ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Budget band</dt>
                <dd>
                  <bdi>
                    {e.budget_band ?? "—"}
                    {e.budget_currency ? ` ${e.budget_currency}` : ""}
                  </bdi>
                </dd>
              </div>
            </dl>
            {e.message && (
              <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm">{e.message}</p>
            )}
          </section>

          {(e.design || e.otherDesigns.length > 0) && (
            <section className="rounded-2xl border border-brand-line p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="size-3.5 text-rose-600" />
                Their designs
              </h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {e.design && (
                  <li>
                    <Link
                      href={`/venue-designer/${e.design.id}`}
                      className="text-rose-700 underline-offset-4 hover:underline"
                    >
                      {e.design.name}
                    </Link>{" "}
                    <span className="text-xs text-muted-foreground">
                      — attached to this enquiry
                    </span>
                  </li>
                )}
                {e.otherDesigns.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/venue-designer/${d.id}`}
                      className="text-muted-foreground underline-offset-4 hover:underline"
                    >
                      {d.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {e.event_id && (
            <section className="rounded-2xl border border-brand-line p-4">
              <h2 className="text-sm font-medium">Event</h2>
              <Link
                href={`/dashboard/admin/events/${e.event_id}`}
                className="mt-1 block text-sm text-rose-700 underline-offset-4 hover:underline"
              >
                {e.event?.title ?? "Open the event"}
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
