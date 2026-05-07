"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, ArrowRight, Camera, Film, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

// Navbar / Footer are RSCs that call `getTranslations` from
// `next-intl/server`. Hoisting them into the server `page.tsx` (which
// passes them as siblings around <Microsite/>) keeps this island a pure
// client component and avoids the "getTranslations is not supported in
// Client Components" runtime error.

interface MediaItem {
  id: string;
  type: string;
  url: string;
  parent_id?: string | null;
}

interface DesignDoc {
  id: string;
  name: string;
  event_type: string;
  setting: string;
  size: string;
  palette: unknown;
  references: unknown;
  style_notes: string | null;
  thumbnail: string | null;
  media: MediaItem[];
}

interface MicrositeProps {
  slug: string;
  pack: {
    publishedAt: Date | string | null;
    isPublic: boolean;
    rendersGenerated: number;
    videosGenerated: number;
  };
  recipient: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  design: DesignDoc | null;
  visionPackPriceLabel: string;
}

interface PaletteShape {
  name?: string;
  colors?: string[];
}

function paletteOf(value: unknown): PaletteShape {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { colors: [] };
  }
  const obj = value as Record<string, unknown>;
  return {
    name: typeof obj.name === "string" ? obj.name : undefined,
    colors: Array.isArray(obj.colors)
      ? obj.colors.filter((c): c is string => typeof c === "string")
      : [],
  };
}

interface RefItem {
  id: string;
  url: string;
  source?: string;
  attribution?: string;
}

interface NormalizedReferences {
  overall_vibe: RefItem[];
  tables: RefItem[];
  flowers: RefItem[];
  lighting: RefItem[];
  venue_decor: RefItem[];
}

function referencesOf(value: unknown): NormalizedReferences {
  const empty: NormalizedReferences = {
    overall_vibe: [],
    tables: [],
    flowers: [],
    lighting: [],
    venue_decor: [],
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const obj = value as Record<string, unknown>;
  for (const cat of Object.keys(empty) as (keyof NormalizedReferences)[]) {
    const arr = obj[cat];
    if (Array.isArray(arr)) {
      empty[cat] = arr.filter(
        (r): r is RefItem =>
          !!r &&
          typeof r === "object" &&
          typeof (r as { url?: unknown }).url === "string",
      );
    }
  }
  return empty;
}

const REFERENCE_CATEGORIES = [
  "overall_vibe",
  "tables",
  "flowers",
  "lighting",
  "venue_decor",
] as const;

type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number];

// Same translation keys the planner-facing InspirationBoard uses, so the
// language is identical for couples + planners (one source of truth for
// "what does flowers mean").
const CATEGORY_LABEL_KEYS: Record<ReferenceCategory, string> = {
  overall_vibe: "categoryOverallVibe",
  tables: "categoryTables",
  flowers: "categoryFlowers",
  lighting: "categoryLighting",
  venue_decor: "categoryVenueDecor",
};

export function Microsite({
  pack,
  recipient,
  design,
  visionPackPriceLabel,
}: MicrositeProps) {
  const t = useTranslations("visionPack");
  const tDesigner = useTranslations("designer");
  const reduceMotion = useReducedMotion();
  const palette = paletteOf(design?.palette);
  const references = referencesOf(design?.references);

  const [heroIdx, setHeroIdx] = useState(0);
  const renders = (design?.media ?? []).filter((m) => m.type === "render");
  const videos = (design?.media ?? []).filter((m) => m.type === "video");
  const heroImg = renders[heroIdx]?.url ?? renders[0]?.url ?? design?.thumbnail ?? null;

  const populatedCategories = REFERENCE_CATEGORIES.filter(
    (cat) => references[cat].length > 0,
  );
  const totalRefs = REFERENCE_CATEGORIES.reduce(
    (n, cat) => n + references[cat].length,
    0,
  );

  const recipientName = recipient.full_name?.trim() || "A Zaffa couple";

  return (
    <main className="flex-1">
        {/* Hero band — full-bleed render with the names in display type. */}
        <section className="relative isolate overflow-hidden bg-rose-50/30 dark:bg-rose-950/20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grain-bg opacity-30"
          />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-16 lg:grid-cols-12 lg:py-24">
            <div className="flex flex-col justify-center lg:col-span-5">
              <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-rose-200/70 bg-white/80 px-3 py-1 text-[10px] font-medium tracking-[0.22em] text-rose-700 uppercase backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                <Sparkles className="size-3" />
                {t("name")}
              </div>
              <motion.h1
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="font-display mt-5 text-balance text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
              >
                {recipientName}
              </motion.h1>
              {design?.name && (
                <p className="mt-4 max-w-md text-pretty text-base text-muted-foreground leading-relaxed sm:text-lg">
                  {design.name}
                </p>
              )}
              {palette.colors && palette.colors.length > 0 && (
                <div className="mt-6 flex items-center gap-2">
                  <span className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
                    {t("micrositePalette")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {palette.colors.slice(0, 6).map((c) => (
                      <span
                        key={c}
                        className="block size-4 rounded-full ring-1 ring-foreground/10"
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="champagne-hairline mt-8 h-px w-32" aria-hidden />
              <p className="mt-6 max-w-md text-sm text-muted-foreground/85 leading-relaxed">
                {pack.rendersGenerated} renders · {pack.videosGenerated} videos · made on Zaffa
              </p>
            </div>

            {heroImg && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="lg:col-span-7"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-rose-200/60 shadow-[0_30px_80px_-30px_rgba(244,63,94,0.45)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroImg}
                    alt={recipientName}
                    className="h-full w-full object-cover"
                  />
                </div>
                {renders.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {renders.slice(0, 6).map((r, i) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setHeroIdx(i)}
                        className={`relative size-14 overflow-hidden rounded-lg ring-2 transition-all ${
                          i === heroIdx
                            ? "ring-rose-500"
                            : "ring-transparent hover:ring-rose-200"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </section>

        {/* Renders gallery */}
        {renders.length > 0 && (
          <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <div className="mb-8 flex items-center gap-3">
              <Camera className="size-4 text-rose-600" />
              <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
                {t("micrositeRendersTitle")}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {renders.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.4) }}
                  className="group overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Videos */}
        {videos.length > 0 && (
          <section className="bg-rose-50/40 py-16 dark:bg-rose-950/20 sm:py-20">
            <div className="mx-auto max-w-6xl px-6">
              <div className="mb-8 flex items-center gap-3">
                <Film className="size-4 text-rose-600" />
                <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
                  {t("micrositeVideosTitle")}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {videos.map((v) => (
                  <div
                    key={v.id}
                    className="overflow-hidden rounded-2xl bg-black ring-1 ring-foreground/[0.06]"
                  >
                    <video
                      src={v.url}
                      className="aspect-video w-full"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Mood board (references) — grouped by category so the eye has
            handles to grab onto, matching the planner marketplace view. */}
        {totalRefs > 0 && (
          <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-3">
                <Heart className="size-4 text-rose-600" />
                <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
                  {t("micrositeMoodboardTitle")}
                </h2>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {totalRefs} {totalRefs === 1 ? "reference" : "references"}
              </span>
            </div>

            <div className="space-y-12">
              {populatedCategories.map((cat) => (
                <div key={cat}>
                  <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-rose-100/80 pb-2 dark:border-rose-900/40">
                    <h3 className="font-display text-lg font-light tracking-tight sm:text-xl">
                      {tDesigner(CATEGORY_LABEL_KEYS[cat])}
                    </h3>
                    <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      {references[cat].length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    {references[cat].map((r) => (
                      <div
                        key={r.id}
                        className="aspect-square overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/[0.05]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {design?.style_notes && (
              <p className="mx-auto mt-12 max-w-2xl text-balance text-center text-sm italic text-muted-foreground sm:text-base">
                &ldquo;{design.style_notes}&rdquo;
              </p>
            )}
          </section>
        )}

        {/* Create yours CTA */}
        <section className="bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60 py-20 dark:from-rose-950/30 dark:via-background dark:to-amber-950/20">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-white/80 px-3 py-1 text-[10px] font-medium tracking-[0.22em] text-rose-700 uppercase backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              <Sparkles className="size-3" />
              {t("micrositeCreateYoursEyebrow")}
            </div>
            <h2 className="font-display mt-5 text-balance text-3xl font-light leading-tight tracking-tight sm:text-4xl">
              {t("micrositeCreateYoursTitle")}
            </h2>
            <p className="mt-4 text-pretty text-sm text-muted-foreground sm:text-base leading-relaxed">
              {t("micrositeCreateYoursBody", { price: visionPackPriceLabel })}
            </p>
            <div className="champagne-hairline mx-auto mt-7 h-px w-32" aria-hidden />
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                render={<Link href="/venue-designer" />}
                size="lg"
                className="h-11 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-5 text-white shadow-lg shadow-rose-500/20 hover:opacity-90"
              >
                {t("micrositeCreateYoursCta", { price: visionPackPriceLabel })}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Button>
              <Button
                render={<Link href="/gallery" />}
                size="lg"
                variant="outline"
              >
                {t("micrositeBackToGallery")}
              </Button>
            </div>
        </div>
      </section>
    </main>
  );
}
