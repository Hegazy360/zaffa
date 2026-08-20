"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles, Wand2 } from "lucide-react";
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
 * A visitor restyles a sample wedding by tapping a setting or a palette —
 * every cell is a real render the live pipeline produced from that exact
 * palette preset, swapped from a pre-generated AVIF. No session, no AI
 * call, no wait. The CTA then carries their picks into
 * `/venue-designer/new`, where the anonymous session mints and their own
 * free render begins from the style they already chose.
 *
 * Two things here are load-bearing for how fast the page feels:
 *
 *  - **One image on first load.** Only the default cell is in the initial
 *    DOM, as the priority image — it is the page's LCP element. Stacking
 *    the others at `opacity: 0` would still download them, and an
 *    idle-time warm-up (the first version) fired immediately on a fast
 *    connection and pulled 692 KB before the reader had touched anything.
 *    The rest now mount on the first sign of intent — a pointer entering
 *    the controls, or focus reaching them — so a tap is instant but a
 *    reader who never interacts pays nothing.
 *  - **Fixed-aspect stage.** Swaps are CLS-zero, and the crossfade is an
 *    onLoad-gated CSS opacity transition, instant under reduced motion.
 *
 * Entrance motion is `.hero-rise` CSS, never framer `initial opacity:0` —
 * that blanks the server HTML until hydration. The stage carries
 * `data-visual-mask` because the assets regenerate; the controls and
 * headline stay asserted in the visual net.
 */

type CellKey = `${string}__${string}`;
const cellKey = (vibe: string, palette: string): CellKey => `${vibe}__${palette}`;
const DEFAULT_CELL = cellKey(DEFAULT_VIBE, DEFAULT_PALETTE);

/** A palette rendered as a paint swatch: hard colour stops, no blending, so
 *  the button shows the actual palette rather than a muddy gradient of it. */
function swatchBackground(colors: string[]): string {
  const stops = colors.slice(0, 4);
  const step = 100 / stops.length;
  return `linear-gradient(90deg, ${stops
    .map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`)
    .join(", ")})`;
}

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
  // The visible cell lags the selected one until the target has pixels — the
  // crossfade never shows an empty frame. Loaded-ness lives in a ref (not
  // state) because a warm-up load must not re-render, and `onLoad` fires only
  // once per image: selecting an already-loaded cell has to resolve
  // synchronously from the set.
  const [visibleCell, setVisibleCell] = useState<CellKey>(DEFAULT_CELL);
  const [mounted, setMounted] = useState<CellKey[]>([DEFAULT_CELL]);
  const loadedRef = useRef<Set<CellKey>>(new Set());
  const activeRef = useRef<CellKey>(DEFAULT_CELL);
  const warmedRef = useRef(false);

  const mountCell = useCallback((key: CellKey) => {
    setMounted((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const handleLoaded = useCallback((key: CellKey) => {
    loadedRef.current.add(key);
    if (activeRef.current === key) setVisibleCell(key);
  }, []);

  /** First sign the reader intends to play with the controls: mount the rest
   *  so the first tap has nothing to wait for. Runs once. */
  const warm = useCallback(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;
    setMounted(
      STUDIO_VIBES.flatMap((v) => STUDIO_PALETTES.map((p) => cellKey(v.id, p.id))),
    );
  }, []);

  const select = (nextVibe: string, nextPalette: string) => {
    const key = cellKey(nextVibe, nextPalette);
    setVibe(nextVibe);
    setPalette(nextPalette);
    activeRef.current = key;
    mountCell(key);
    if (loadedRef.current.has(key)) setVisibleCell(key);
    track(ANALYTICS_EVENTS.STUDIO_CHIP_SELECTED, {
      vibe: nextVibe,
      palette: nextPalette,
    });
  };

  const activePalette =
    STUDIO_PALETTES.find((p) => p.id === palette) ?? STUDIO_PALETTES[0];

  return (
    <section className="relative isolate overflow-clip bg-gradient-to-b from-rose-50/60 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -end-32 h-[36rem] w-[36rem] rounded-full bg-gradient-to-br from-rose-200/40 to-amber-200/30 blur-3xl"
      />

      <div className="container relative mx-auto grid max-w-7xl gap-y-8 px-4 pt-16 pb-20 md:pt-24 md:pb-28 lg:grid-cols-12 lg:gap-x-16 lg:gap-y-8">
        <div className="lg:col-span-5 lg:row-start-1 lg:self-end">
          <div className="hero-rise mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-rose-200/60 bg-white/60 px-3 py-1.5 text-eyebrow text-rose-700 backdrop-blur-md sm:mb-6 sm:px-4 sm:text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            {t("studioEyebrow")}
          </div>

          {/* The headline is a headline. It used to end with "Restyle this
              one." — an instruction wedged into the sentence, which read as
              a third clause of the title rather than as something to do.
              The instruction now lives next to the thing it refers to. */}
          {/* `rtl:leading-*` is not decoration: Arabic sets taller than Latin
              at the same font-size — ascenders and the deep descenders on
              ك/ج need the room — and at 1.02 the two lines of the Arabic
              headline physically overlapped. Latin keeps the tight display
              leading it was designed with. */}
          <h1
            style={{ animationDelay: "0.05s" }}
            className="hero-rise font-display text-balance text-[clamp(2.25rem,8vw,4.5rem)] font-light leading-[1.05] tracking-tight rtl:leading-[1.4] sm:text-[clamp(2.5rem,5.5vw,4.5rem)] sm:leading-[1.02] sm:rtl:leading-[1.4]"
          >
            {t("studioTitlePart1")}{" "}
            {/* `rtl:not-italic`: there is no italic in Arabic typography, so
                the browser synthesises one by skewing the glyphs — which
                pushes them outside their inline box and, under
                `background-clip: text`, shears the leading letter clean off.
                Latin keeps the real italic the display face ships. */}
            <span className="text-brand-gradient italic rtl:not-italic">
              {t("studioTitleItalic")}
            </span>
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
          {/* Fixed aspect so swaps are CLS-zero; masked in the visual net
              because the assets regenerate. */}
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
                sizes="(min-width: 1024px) 58vw, 94vw"
                quality={62}
                priority={key === DEFAULT_CELL}
                onLoad={() => handleLoaded(key)}
                className={cn(
                  "object-cover transition-opacity duration-300 motion-reduce:transition-none",
                  key === visibleCell ? "opacity-100" : "opacity-0",
                )}
              />
            ))}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
            />
            <p className="absolute bottom-3 start-4 text-xs font-medium text-white/85 drop-shadow">
              {t("studioSampleCaption")}
            </p>
          </div>

          {/* The controls, directly under the thing they change. Hovering or
              tabbing here is the intent signal that warms the other cells. */}
          <div
            className="mt-5"
            onPointerEnter={warm}
            onFocusCapture={warm}
            onTouchStart={warm}
          >
            <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong">
              <Wand2 className="size-4" aria-hidden />
              {t("studioRestyleHint")}
            </p>

            {/* One cluster, not two ends of a bar: `justify-between` pushed the
                palette swatches to the far edge of a wide column, so the two
                halves of a single control read as unrelated. */}
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-8">
              {/* Setting — a segmented control. The previous version gave every
                  chip its own border AND a selection ring at a slightly
                  different radius, which read as a doubled, fuzzy outline.
                  One track, one moving highlight, no per-item border. */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t("studioVibeLabel")}
                </p>
                <div
                  role="group"
                  aria-label={t("studioVibeLabel")}
                  className="inline-flex rounded-full border border-brand-line bg-white/70 p-1 backdrop-blur-sm"
                >
                  {STUDIO_VIBES.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={v.id === vibe}
                      onClick={() => select(v.id, palette)}
                      className={cn(
                        "min-h-9 rounded-full px-4 text-sm transition-colors duration-200",
                        v.id === vibe
                          ? "bg-brand-gradient font-medium text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`studioVibe_${v.id}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Palette — paint swatches. The name of the selected one is
                  spelled out, so the dots are never the only clue about what
                  the render is supposed to be showing. */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t("studioPaletteLabel")}
                  <span className="ms-1.5 text-foreground">
                    {t(`studioPalette_${activePalette.id}`)}
                  </span>
                </p>
                <div
                  role="group"
                  aria-label={t("studioPaletteLabel")}
                  className="flex items-center gap-2.5"
                >
                  {STUDIO_PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={p.id === palette}
                      aria-label={t(`studioPalette_${p.id}`)}
                      title={t(`studioPalette_${p.id}`)}
                      onClick={() => select(vibe, p.id)}
                      style={{ backgroundImage: swatchBackground(p.colors) }}
                      className={cn(
                        "size-10 rounded-full transition-[box-shadow,transform] duration-200",
                        // A single ring, drawn outside the circle, so there is
                        // never a border and a ring fighting for the same edge.
                        p.id === palette
                          ? "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--brand)] scale-105"
                          : "shadow-[0_0_0_1px_rgba(0,0,0,0.10)] hover:scale-105",
                      )}
                    />
                  ))}
                </div>
              </div>
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
                    track(ANALYTICS_EVENTS.STUDIO_HANDOFF_CLICKED, {
                      vibe,
                      palette,
                    })
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
