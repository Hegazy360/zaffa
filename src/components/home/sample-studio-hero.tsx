"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { useTikTokViewContent } from "@/lib/use-tiktok-view-content";
import {
  DEFAULT_PALETTE,
  DEFAULT_VIBE,
  STUDIO_IMAGE,
  STUDIO_PALETTES,
  STUDIO_VIBES,
  studioAssetPath,
} from "@/data/sample-studio";

/**
 * The sample studio: the homepage hero IS the product.
 *
 * A visitor restyles a sample wedding by tapping vibe and palette chips —
 * every cell is a real render produced by the live pipeline from that
 * exact palette preset, swapped instantly from pre-generated AVIFs. No
 * session, no network beyond static assets, no AI call, no wait. The CTA
 * then carries their choices into `/venue-designer/new`, where the
 * middleware mints the anonymous session and their own free render
 * begins from the style they already picked.
 *
 * The LCP contract (the reason the code is shaped this way):
 *   - ONLY the default cell exists in the initial DOM, as the priority
 *     image — it is the page's LCP element.
 *   - Other cells mount on demand (never twelve stacked images at
 *     opacity-0 — stacked images still download).
 *   - After idle, the default vibe's other palettes and the default
 *     palette's other vibes warm up so the first chip tap is instant.
 *   - The stage has a fixed aspect ratio, so swaps are CLS-zero, and the
 *     crossfade is a plain CSS opacity transition, gated on onLoad,
 *     instant under prefers-reduced-motion.
 *
 * Entrance motion is `.hero-rise` CSS (never framer `initial opacity:0`
 * above the fold — that blanks the server HTML until hydration). The
 * stage carries `data-visual-mask` because the assets regenerate; the
 * chips and headline stay asserted in the visual net.
 */

type CellKey = `${string}__${string}`;
const cellKey = (vibe: string, palette: string): CellKey => `${vibe}__${palette}`;

export function SampleStudioHero({
  socialProof,
}: {
  /** Server-rendered social proof. A slot rather than a fetch because this
   *  component is a client boundary and the counts must be real. */
  socialProof?: React.ReactNode;
}) {
  const t = useTranslations("marketing");
  useTikTokViewContent();

  const [vibe, setVibe] = useState(DEFAULT_VIBE);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  // The visible cell lags the selected one until the target has pixels —
  // the crossfade never shows an empty frame. Loaded-ness lives in refs
  // (not state) because a warm-up load must not re-render the hero, and
  // `onLoad` fires only once per image: selecting an already-loaded cell
  // has to resolve synchronously from the set.
  const [visibleCell, setVisibleCell] = useState<CellKey>(
    cellKey(DEFAULT_VIBE, DEFAULT_PALETTE),
  );
  const [mounted, setMounted] = useState<CellKey[]>([
    cellKey(DEFAULT_VIBE, DEFAULT_PALETTE),
  ]);
  const loadedRef = useRef<Set<CellKey>>(new Set());
  const activeRef = useRef<CellKey>(cellKey(DEFAULT_VIBE, DEFAULT_PALETTE));

  const mountCell = useCallback((key: CellKey) => {
    setMounted((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const handleLoaded = useCallback((key: CellKey) => {
    loadedRef.current.add(key);
    if (activeRef.current === key) setVisibleCell(key);
  }, []);

  // Warm the cells one tap away, once the page has settled.
  useEffect(() => {
    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1500);
    const handle = idle(() => {
      for (const p of STUDIO_PALETTES) mountCell(cellKey(DEFAULT_VIBE, p.id));
      for (const v of STUDIO_VIBES) mountCell(cellKey(v.id, DEFAULT_PALETTE));
    });
    return () => {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(handle as number);
      } else {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      }
    };
  }, [mountCell]);

  const select = (nextVibe: string, nextPalette: string) => {
    const key = cellKey(nextVibe, nextPalette);
    setVibe(nextVibe);
    setPalette(nextPalette);
    activeRef.current = key;
    mountCell(key);
    if (loadedRef.current.has(key)) setVisibleCell(key);
    track(ANALYTICS_EVENTS.STUDIO_CHIP_SELECTED, { vibe: nextVibe, palette: nextPalette });
  };

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-rose-50/60 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -end-32 h-[36rem] w-[36rem] rounded-full bg-gradient-to-br from-rose-200/40 to-amber-200/30 blur-3xl"
      />

      {/* Same two-row × 12-col shape as the hero it replaces: headline
          top-left, stage spanning both rows on the right, controls + CTA +
          proof bottom-left. Mobile DOM order: headline → stage+chips →
          CTA → proof. */}
      <div className="container relative mx-auto grid max-w-7xl gap-y-8 px-4 pt-16 pb-20 md:pt-24 md:pb-28 lg:grid-cols-12 lg:gap-x-16 lg:gap-y-8">
        <div className="lg:col-span-5 lg:row-start-1 lg:self-end">
          <div className="hero-rise mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-rose-200/60 bg-white/60 px-3 py-1.5 text-eyebrow text-rose-700 backdrop-blur-md sm:mb-6 sm:px-4 sm:text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            {t("studioEyebrow")}
          </div>

          <h1
            style={{ animationDelay: "0.05s" }}
            className="hero-rise font-display text-balance text-[clamp(2.25rem,8vw,4.5rem)] font-light leading-[1.05] tracking-tight sm:text-[clamp(2.5rem,5.5vw,4.5rem)] sm:leading-[1.02]"
          >
            {t("studioTitlePart1")}{" "}
            <span className="italic">{t("studioTitleItalic")}</span>{" "}
            <span className="text-brand-gradient">{t("studioTitleHighlight")}</span>
            {t("studioTitleTail")}
          </h1>

          <p
            style={{ animationDelay: "0.15s" }}
            className="hero-rise mt-5 max-w-xl text-pretty text-base text-muted-foreground md:text-lg"
          >
            {t("studioSubtitle")}
          </p>
        </div>

        <div
          style={{ animationDelay: "0.2s" }}
          className="hero-rise lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1 lg:self-center"
        >
          {/* The stage. Fixed aspect so palette/vibe swaps are CLS-zero;
              masked in the visual net because the assets regenerate. */}
          <div
            data-visual-mask
            className="relative w-full overflow-hidden rounded-[1.5rem] shadow-glow-lg ring-1 ring-black/5 sm:rounded-[2rem]"
            style={{
              aspectRatio: `${STUDIO_IMAGE.width} / ${STUDIO_IMAGE.height}`,
            }}
          >
            {mounted.map((key) => (
              <Image
                key={key}
                src={studioAssetPath(...(key.split("__") as [string, string]))}
                alt={t("studioStageAlt")}
                fill
                sizes="(min-width: 1024px) 55vw, 92vw"
                priority={key === cellKey(DEFAULT_VIBE, DEFAULT_PALETTE)}
                onLoad={() => handleLoaded(key)}
                className={cn(
                  "object-cover transition-opacity duration-300 motion-reduce:transition-none",
                  key === visibleCell ? "opacity-100" : "opacity-0",
                )}
              />
            ))}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"
            />
            <p className="absolute bottom-3 start-4 text-xs font-medium text-white/85 drop-shadow">
              {t("studioSampleCaption")}
            </p>
          </div>

          {/* The controls — the whole point. Two labelled chip groups. */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="group"
              aria-label={t("studioVibeLabel")}
              className="flex gap-2 overflow-x-auto"
            >
              {STUDIO_VIBES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={v.id === vibe}
                  onClick={() => select(v.id, palette)}
                  className={cn(
                    "min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm transition-colors",
                    v.id === vibe
                      ? "border-rose-400 bg-rose-50/80 font-medium text-rose-700 ring-1 ring-rose-300"
                      : "border-brand-line bg-white/70 text-foreground hover:border-rose-200",
                  )}
                >
                  {t(`studioVibe_${v.id}`)}
                </button>
              ))}
            </div>

            <div
              role="group"
              aria-label={t("studioPaletteLabel")}
              className="flex gap-2 overflow-x-auto"
            >
              {STUDIO_PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === palette}
                  aria-label={t(`studioPalette_${p.id}`)}
                  title={t(`studioPalette_${p.id}`)}
                  onClick={() => select(vibe, p.id)}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 transition-colors",
                    p.id === palette
                      ? "border-rose-400 bg-rose-50/80 ring-1 ring-rose-300"
                      : "border-brand-line bg-white/70 hover:border-rose-200",
                  )}
                >
                  {p.colors.slice(0, 4).map((c) => (
                    <span
                      key={c}
                      aria-hidden
                      className="block size-3.5 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 lg:col-start-1 lg:row-start-2 lg:self-start">
          <div
            style={{ animationDelay: "0.25s" }}
            className="hero-rise flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            {/* The handoff: their picks travel into the real designer, where
                the anonymous session is minted and the free render begins
                from the style they already chose. */}
            <Button
              variant="cta"
              size="xl"
              render={
                <Link
                  href={`/venue-designer/new?vibe=${vibe}&palette=${palette}`}
                  onClick={() =>
                    track(ANALYTICS_EVENTS.STUDIO_HANDOFF_CLICKED, { vibe, palette })
                  }
                />
              }
              className="group w-full sm:w-auto sm:px-8"
            >
              {t("studioCta")}
              <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="#how-it-works" />}
              className="h-12 w-full gap-2 border-rose-200/80 bg-white px-6 text-base text-rose-700 hover:bg-rose-50/70 hover:text-rose-700 sm:w-auto sm:px-8"
            >
              {t("heroCtaSecondary")}
            </Button>
          </div>

          <p
            style={{ animationDelay: "0.3s" }}
            className="hero-rise mt-3 text-xs text-muted-foreground"
          >
            {t("studioCtaHint")}
          </p>

          {/* Real proof, injected from a server component. */}
          {socialProof}
        </div>
      </div>
    </section>
  );
}
