"use client";

import { useState } from "react";
import { ExternalLink, Loader2, ReceiptText, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { isFlagEnabled } from "@/lib/flags";
import { formatMoney } from "@/lib/money-format";
import { marketForCountry } from "@/lib/decor-pricing";
import type { DesignBrief, BriefVersion } from "@/lib/design-brief";
import { Button } from "@/components/ui/button";
import { MediaImage } from "@/components/ui/media-image";

/**
 * "Their design": the quotable brief on an enquiry (F5).
 *
 * Everything the team needs to price the wedding without opening the
 * designer (which an admin cannot load, it is owner-scoped): the render the
 * couple chose, every version with what they asked to change, their venue
 * before and after, palette, notes, and the decor plan totals.
 *
 * The plan is only ever priced from a cached read of the render; if there
 * is none yet, the admin decides to spend the (small) model call with the
 * button, a page view never does.
 *
 * English copy, like the rest of the admin console.
 */

const MODE_LABEL: Record<NonNullable<BriefVersion["mode"]>, string> = {
  generate: "Generated",
  dress_venue: "Dressed their venue",
  refine: "Refined",
};

export function DesignBriefSection({
  enquiryId,
  designName,
  country,
  brief,
}: {
  enquiryId: string;
  designName: string;
  country: string | null;
  brief: DesignBrief;
}) {
  const utils = trpc.useUtils();
  const [computing, setComputing] = useState(false);
  const [computeFailed, setComputeFailed] = useState(false);
  const { selected, plan } = brief;

  const computePlan = async () => {
    if (!selected) return;
    setComputing(true);
    setComputeFailed(false);
    try {
      // Reads the render once and caches the analysis on it; the brief then
      // prices it on every view for free.
      await utils.decorPlan.forMedia.fetch({
        mediaId: selected.id,
        market: marketForCountry(country),
      });
      await utils.enquiries.byId.invalidate({ id: enquiryId });
    } catch {
      setComputeFailed(true);
    } finally {
      setComputing(false);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-brand-line p-4" data-testid="design-brief">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-3.5 text-rose-600" aria-hidden />
          Their design
          <span className="font-normal text-muted-foreground">· {designName}</span>
        </h2>
        {selected ? (
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs">
            {selected.pinned
              ? `Chosen by the couple: version ${selected.number}`
              : `Newest version (${selected.number}), none chosen`}
          </span>
        ) : null}
      </header>

      {selected ? (
        <figure className="space-y-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-stone-100">
            <MediaImage
              src={selected.url}
              alt={`${designName}, version ${selected.number}`}
              fill
              sizes="half"
              className="object-contain"
            />
          </div>
          <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {selected.mode ? MODE_LABEL[selected.mode] : "Render"}
              {selected.instruction ? (
                <>
                  {": "}
                  <q dir="auto">{selected.instruction}</q>
                </>
              ) : null}
            </span>
            <a
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-rose-700 underline-offset-4 hover:underline"
            >
              Full size, no watermark
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </figcaption>
        </figure>
      ) : (
        <p className="text-sm text-muted-foreground">No render on this design yet.</p>
      )}

      {/* Decor plan totals, from the cached read of the chosen render. */}
      {plan ? (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50/60 p-3" data-testid="brief-plan">
          <ReceiptText className="mt-0.5 size-4 shrink-0 text-rose-700" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">
              Decor estimate{" "}
              <bdi>
                {formatMoney(plan.lo, plan.currency, "en")} to{" "}
                {formatMoney(plan.hi, plan.currency, "en")}
              </bdi>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {plan.items} lines for {plan.guestCount} guests
              {plan.guestCountAssumed ? " (assumed from the size they picked)" : ""},{" "}
              {plan.tables} tables. Priced for {plan.market === "US" ? "USD, an estimate" : plan.currency}.
            </p>
          </div>
        </div>
      ) : brief.planNeedsAnalysis && isFlagEnabled("decorPlan") ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 p-3 text-sm">
          <p className="flex-1 text-muted-foreground">
            No decor plan yet: this render has not been read.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={computing}
            onClick={() => void computePlan()}
            className="h-11 gap-1.5"
          >
            {computing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Compute plan
          </Button>
          {computeFailed ? (
            <p role="alert" className="w-full text-xs text-rose-700">
              Could not read the render. Try again in a minute.
            </p>
          ) : null}
        </div>
      ) : null}

      {brief.palette.colors.length > 0 || brief.styleNotes || brief.briefEn ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {brief.palette.colors.length > 0 ? (
            <div>
              <h3 className="text-xs text-muted-foreground">
                Palette{brief.palette.name ? `: ${brief.palette.name}` : ""}
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {brief.palette.colors.map((c) => (
                  <li key={c} className="flex items-center gap-1.5 text-xs">
                    <span
                      aria-hidden
                      className="size-6 rounded-full ring-1 ring-foreground/10"
                      style={{ backgroundColor: c }}
                    />
                    <code className="font-mono">{c}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {brief.styleNotes ? (
            <div>
              <h3 className="text-xs text-muted-foreground">Their notes</h3>
              <blockquote
                dir="auto"
                className="mt-2 border-s-2 border-brand-line ps-3 text-sm whitespace-pre-line"
              >
                {brief.styleNotes}
              </blockquote>
            </div>
          ) : null}
          {brief.briefEn ? (
            <div className="sm:col-span-2">
              <h3 className="text-xs text-muted-foreground">Brief in English</h3>
              <p className="mt-2 text-sm">{brief.briefEn}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Their own venue, and the render that dressed it. Side by side:
          the operator compares, they do not need a slider. */}
      {brief.venue ? (
        <div>
          <h3 className="text-xs text-muted-foreground">Their venue</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <figure>
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-stone-100">
                <MediaImage src={brief.venue.photoUrl} alt="Their venue as it is" fill sizes="card" />
              </div>
              <figcaption className="mt-1 text-xs text-muted-foreground">Before</figcaption>
            </figure>
            {brief.venue.dressed ? (
              <figure>
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-stone-100">
                  <MediaImage
                    src={brief.venue.dressed.url}
                    alt={`Their venue dressed, version ${brief.venue.dressed.number}`}
                    fill
                    sizes="card"
                  />
                </div>
                <figcaption className="mt-1 text-xs text-muted-foreground">
                  After, version {brief.venue.dressed.number}
                </figcaption>
              </figure>
            ) : (
              <p className="self-center text-xs text-muted-foreground">
                No render has dressed this photo yet.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {brief.versions.length > 1 ? (
        <div>
          <h3 className="text-xs text-muted-foreground">
            Every version ({brief.versions.length})
          </h3>
          <ol className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {brief.versions.map((v) => (
              <li key={v.id} className="space-y-1.5">
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-stone-100 ring-offset-2 data-[selected=true]:ring-2 data-[selected=true]:ring-rose-400"
                  data-selected={v.selected}
                  aria-label={`Version ${v.number}, full size`}
                >
                  <MediaImage src={v.url} alt="" fill sizes="card" />
                </a>
                <p className="text-xs font-medium">
                  Version {v.number}
                  {v.selected ? " · chosen" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {v.mode === "refine" && v.parentNumber
                    ? `Refined from version ${v.parentNumber}`
                    : v.mode
                      ? MODE_LABEL[v.mode]
                      : "Render"}
                </p>
                {v.instruction ? (
                  <p dir="auto" className="text-xs">
                    <q>{v.instruction}</q>
                  </p>
                ) : null}
                {v.instructionEn && v.instructionEn !== v.instruction ? (
                  <p className="text-xs text-muted-foreground">{v.instructionEn}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
