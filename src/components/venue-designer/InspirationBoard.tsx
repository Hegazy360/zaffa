"use client";

import { useState } from "react";
import {
  ExternalLink,
  Flower2,
  Frame,
  ImageOff,
  Lamp,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  REFERENCE_CATEGORIES,
  type ReferenceCategory,
} from "@/types/venue-designer";

interface PlannerRef {
  id: string;
  url: string;
  thumbnailUrl?: string;
  source?: string;
  sourceUrl?: string;
  attribution?: string;
}

type CategoryRefs = Record<ReferenceCategory, PlannerRef[]>;

const EMPTY: CategoryRefs = {
  overall_vibe: [],
  tables: [],
  flowers: [],
  lighting: [],
  venue_decor: [],
};

const CATEGORY_ICONS: Record<ReferenceCategory, LucideIcon> = {
  overall_vibe: Sparkles,
  tables: Utensils,
  flowers: Flower2,
  lighting: Lamp,
  venue_decor: Frame,
};

// Maps each category to its translation keys living in the `designer` namespace
// (already used by the designer flow, so the language is identical for couples
// and planners — there's only one definition of "what does flowers mean").
const CATEGORY_LABEL_KEYS: Record<ReferenceCategory, string> = {
  overall_vibe: "categoryOverallVibe",
  tables: "categoryTables",
  flowers: "categoryFlowers",
  lighting: "categoryLighting",
  venue_decor: "categoryVenueDecor",
};

const CATEGORY_DESC_KEYS: Record<ReferenceCategory, string> = {
  overall_vibe: "categoryDescOverallVibe",
  tables: "categoryDescTables",
  flowers: "categoryDescFlowers",
  lighting: "categoryDescLighting",
  venue_decor: "categoryDescVenueDecor",
};

// The references column on the design row is `Json`, so anything could be in
// there. Defensively parse into the shape we need without trusting the wire
// data, and always return all 5 buckets so the order is deterministic.
function groupReferences(value: unknown): CategoryRefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY;
  const obj = value as Record<string, unknown>;
  const out: CategoryRefs = {
    overall_vibe: [],
    tables: [],
    flowers: [],
    lighting: [],
    venue_decor: [],
  };
  for (const cat of REFERENCE_CATEGORIES) {
    const raw = obj[cat];
    if (!Array.isArray(raw)) continue;
    let i = 0;
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const rec = r as Record<string, unknown>;
      const url = typeof rec.url === "string" ? rec.url : null;
      if (!url) continue;
      out[cat].push({
        id: typeof rec.id === "string" ? rec.id : `${cat}-${i++}`,
        url,
        thumbnailUrl:
          typeof rec.thumbnailUrl === "string" ? rec.thumbnailUrl : undefined,
        source: typeof rec.source === "string" ? rec.source : undefined,
        sourceUrl:
          typeof rec.sourceUrl === "string" ? rec.sourceUrl : undefined,
        attribution:
          typeof rec.attribution === "string" ? rec.attribution : undefined,
      });
    }
  }
  return out;
}

interface InspirationBoardProps {
  references: unknown;
  /** When true, render a compact preview (smaller heading, denser grid). */
  compact?: boolean;
  className?: string;
}

export function InspirationBoard({
  references,
  compact = false,
  className,
}: InspirationBoardProps) {
  const t = useTranslations("plannerInspiration");
  const tDesigner = useTranslations("designer");
  const grouped = groupReferences(references);
  const total = REFERENCE_CATEGORIES.reduce(
    (n, c) => n + grouped[c].length,
    0,
  );

  const [lightbox, setLightbox] = useState<{
    ref: PlannerRef;
    category: ReferenceCategory;
  } | null>(null);

  if (total === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed border-rose-200/70 bg-white/40 p-8 text-center backdrop-blur-sm",
          className,
        )}
      >
        <ImageOff className="mx-auto mb-3 size-6 text-rose-400" />
        <p className="font-display text-base font-medium tracking-tight">
          {t("emptyTitle")}
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {t("emptyBody")}
        </p>
      </div>
    );
  }

  const populated = REFERENCE_CATEGORIES.filter((c) => grouped[c].length > 0);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm",
        className,
      )}
      aria-label={t("sectionAria")}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rose-100/70 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            {t("eyebrow")}
          </p>
          <h3
            className={cn(
              "font-display mt-1 font-medium tracking-tight",
              compact ? "text-base" : "text-lg",
            )}
          >
            {t("title")}
          </h3>
          {!compact && (
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              {t("subtitle")}
            </p>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-50 to-amber-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200/70">
          <Sparkles className="size-3" />
          {t("totalCount", { count: total })}
        </span>
      </header>

      <div className="divide-y divide-rose-100/70">
        {populated.map((category) => {
          const Icon = CATEGORY_ICONS[category];
          const refs = grouped[category];
          return (
            <div key={category} className="px-5 py-5 sm:px-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 text-rose-700 ring-1 ring-rose-200/70"
                    aria-hidden
                  >
                    <Icon className="size-3.5" strokeWidth={2} />
                  </span>
                  <h4 className="font-display text-base font-medium tracking-tight">
                    {tDesigner(CATEGORY_LABEL_KEYS[category])}
                  </h4>
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    {t("categoryPickCount", { count: refs.length })}
                  </span>
                </div>
              </div>
              <p className="mb-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {tDesigner(CATEGORY_DESC_KEYS[category])}
              </p>
              <ul
                className={cn(
                  "grid gap-2",
                  compact
                    ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5"
                    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
                )}
              >
                {refs.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setLightbox({ ref: r, category })}
                      aria-label={t("openImageAria", {
                        category: tDesigner(CATEGORY_LABEL_KEYS[category]),
                      })}
                      className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-stone-100 ring-1 ring-foreground/[0.04] transition-shadow hover:ring-rose-300 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.thumbnailUrl ?? r.url}
                        alt={t("imageAlt", {
                          category: tDesigner(CATEGORY_LABEL_KEYS[category]),
                        })}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/55 via-black/25 to-transparent px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-white/90">
                          {tDesigner(CATEGORY_LABEL_KEYS[category])}
                        </span>
                        {r.attribution && (
                          <span className="truncate text-[10px] text-white/75">
                            {r.attribution}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <Dialog
        open={lightbox !== null}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
      >
        <DialogContent className="max-w-3xl gap-3 p-0 sm:max-w-3xl">
          {lightbox && (
            <>
              <DialogHeader className="px-5 pt-5">
                <DialogTitle className="font-display text-lg font-medium tracking-tight">
                  {tDesigner(CATEGORY_LABEL_KEYS[lightbox.category])}
                </DialogTitle>
                <DialogDescription>
                  {tDesigner(CATEGORY_DESC_KEYS[lightbox.category])}
                </DialogDescription>
              </DialogHeader>
              <div className="relative w-full overflow-hidden bg-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightbox.ref.url}
                  alt={t("imageAlt", {
                    category: tDesigner(
                      CATEGORY_LABEL_KEYS[lightbox.category],
                    ),
                  })}
                  className="mx-auto block max-h-[70vh] w-auto max-w-full object-contain"
                />
              </div>
              {(lightbox.ref.attribution || lightbox.ref.sourceUrl) && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rose-100/70 bg-rose-50/40 px-5 py-3 text-xs">
                  <span className="text-muted-foreground">
                    {lightbox.ref.attribution ?? t("sourcedFromGeneric")}
                  </span>
                  {lightbox.ref.sourceUrl && (
                    <a
                      href={lightbox.ref.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-rose-700 hover:underline"
                    >
                      {t("openOriginal")}
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
