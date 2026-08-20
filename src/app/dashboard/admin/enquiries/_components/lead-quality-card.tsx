"use client";

import { trpc } from "@/lib/trpc";

/**
 * Lead quality, by week.
 *
 * This is the instrumentation ZAF-47 required before the fee table could be
 * published. Publishing a price is expected to *reduce* enquiry volume while
 * raising the share that are real, so volume read alone would look like the
 * page failing. The number to watch is the quote-worthy rate: it should rise
 * while volume falls. If both fall, the page is wrong.
 *
 * Deliberately small and always visible at the top of the pipeline, rather
 * than an analytics page nobody opens in the weeks that matter.
 */

function pct(value: number | null): string {
  if (value === null) return "-";
  return `${Math.round(value * 100)}%`;
}

export function LeadQualityCard() {
  const q = trpc.enquiries.leadQuality.useQuery({ weeks: 8 });
  const data = q.data;

  if (q.isLoading || !data) return null;

  if (data.overall.total === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/30 px-5 py-4">
        <p className="text-sm text-muted-foreground">
          No enquiries yet. Once they arrive, this shows the share reaching a
          quote each week, the number that should rise as published pricing
          filters out the browsers.
        </p>
      </section>
    );
  }

  const weeks = data.weeks.slice(-8);
  const peak = Math.max(...weeks.map((w) => w.total), 1);
  const latest = weeks.at(-1);

  return (
    <section className="rounded-2xl border border-brand-line bg-white/70 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Lead quality</h2>
        <p className="text-xs text-muted-foreground">
          <span className="font-display text-lg text-foreground">
            {pct(data.overall.quoteWorthyRate)}
          </span>{" "}
          reached a quote · {data.overall.total} enquiries
        </p>
      </div>

      {/* Two figures per week: total volume as the bar height, quote-worthy
          share as the filled portion. The whole point is watching them move in
          opposite directions - that is what "fewer, better" looks like. */}
      <ol className="mt-4 flex items-end gap-2">
        {weeks.map((w) => (
          <li
            key={w.weekStart}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <span className="text-xs text-muted-foreground">
              {pct(w.quoteWorthyRate)}
            </span>
            <div
              className="flex w-full items-end justify-center rounded-t bg-rose-100"
              style={{ height: `${Math.max(8, (w.total / peak) * 56)}px` }}
              title={`${w.weekStart}: ${w.quoted}/${w.total} reached a quote`}
            >
              <div
                className="w-full rounded-t bg-rose-500"
                style={{ height: `${(w.quoteWorthyRate ?? 0) * 100}%` }}
              />
            </div>
            <span className="w-full truncate text-center text-xs text-muted-foreground">
              {w.weekStart.slice(5)}
            </span>
          </li>
        ))}
      </ol>

      {latest && (
        <p className="mt-3 text-xs text-muted-foreground">
          {latest.withPublishedPricing} of {latest.total} this week arrived with
          our fee published.
        </p>
      )}
    </section>
  );
}
