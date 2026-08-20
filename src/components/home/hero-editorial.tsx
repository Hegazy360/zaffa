"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVisionPackPricing } from "@/components/vision-pack/use-pricing";
import { ttTrack, TIKTOK_EVENTS } from "@/lib/tiktok";
import { DEFAULT_PACK_SKU } from "@/lib/vision-pack";
import { minorToMajor } from "@/lib/vision-pack-pricing";

// Entrance motion here is CSS (`.hero-rise` in globals.css), not
// framer-motion. framer-motion server-renders `initial={{ opacity: 0 }}`
// as an inline `opacity:0`, so the hero stayed invisible until the bundle
// hydrated — the first paint of the marketing page was an empty box. Every
// other section can keep using framer-motion; they animate on scroll, by
// which point JS has long since loaded.

// One AI-rendered example — a representative output of the kind of room our
// platform helps couples design. Static (no parallax) so the hero reads as a
// magazine spread, not an interactive toy.
const HERO_IMAGE = "/home/examples/hero.jpeg";

export function HeroEditorial({
  socialProof,
}: {
  /** Server-rendered social proof. A slot rather than a fetch because this
   *  component is a client boundary and the counts must be real. */
  socialProof?: React.ReactNode;
}) {
  const t = useTranslations("marketing");
  const pricing = useVisionPackPricing();

  // Fire TikTok ViewContent once per mount. The home-page hero is the
  // canonical Vision Pack "product page" surface — TikTok requires this
  // funnel-top event for vertical optimization (else campaigns drop ROAS,
  // see the Events Manager warning). Guarded by a ref so re-renders /
  // pricing refetches don't re-fire. `ttTrack` itself no-ops when
  // NEXT_PUBLIC_TIKTOK_PIXEL_ID is unset, so this is a hard no-op in
  // local dev / tests / CI without the key.
  const ttFiredRef = useRef(false);
  useEffect(() => {
    if (ttFiredRef.current) return;
    if (pricing.isLoading) return;
    ttFiredRef.current = true;
    const major = minorToMajor(pricing.amount, pricing.currency);
    ttTrack(TIKTOK_EVENTS.VIEW_CONTENT, {
      contents: [
        {
          content_id: DEFAULT_PACK_SKU,
          content_type: "product",
          content_name: "Wedding Design Pack",
          quantity: 1,
          price: major,
        },
      ],
      value: major,
      currency: pricing.currency.toUpperCase(),
    });
  }, [pricing.isLoading, pricing.amount, pricing.currency]);

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-rose-50/60 via-background to-background dark:from-rose-950/20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -end-32 h-[36rem] w-[36rem] rounded-full bg-gradient-to-br from-rose-200/40 to-amber-200/30 blur-3xl dark:from-rose-900/20 dark:to-amber-900/10"
      />

      {/* Two-row × 12-col grid on desktop, single column on mobile.
          On mobile the DOM order produces: top text → image → CTA + ratings,
          which keeps the hero render visible alongside the headline rather
          than buried below the social proof. On desktop the image cell spans
          both rows of the right column, with `self-end`/`self-start` on the
          left cells so the text reads as a single centred column — visually
          identical to the original two-column layout. */}
      <div className="container relative mx-auto grid max-w-7xl gap-y-10 px-4 pt-20 pb-20 md:pt-28 md:pb-32 lg:grid-cols-12 lg:gap-x-16 lg:gap-y-10 lg:pb-32">
        <div className="lg:col-span-6 lg:row-start-1 lg:self-end">
          <div
            className="hero-rise mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-rose-200/60 bg-white/60 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-rose-700 backdrop-blur-md sm:mb-6 sm:px-4 sm:text-xs dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("heroEyebrow")}
          </div>

          <h1
            style={{ animationDelay: "0.05s" }}
            className="hero-rise font-display text-balance text-[clamp(2.25rem,9vw,5.25rem)] font-light leading-[1.05] tracking-tight sm:text-[clamp(2.5rem,6.5vw,5.25rem)] sm:leading-[1]"
          >
            {t("heroTitlePart1")}{" "}
            <span className="italic">{t("heroTitleItalic")}</span>{" "}
            <span className="text-brand-gradient">
              {t("heroTitleHighlight")}
            </span>
            {/* No separator space before the tail — it holds the sentence's
                terminal punctuation, so `{" "}` here renders "all of it ." */}
            {t("heroTitleTail")}
          </h1>

          <p
            style={{ animationDelay: "0.15s" }}
            className="hero-rise mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:mt-6 md:text-lg lg:max-w-2xl"
          >
            {t("heroSubtitle")}
          </p>
        </div>

        <div
          style={{ animationDelay: "0.2s" }}
          className="hero-rise relative lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:flex lg:items-center"
        >
          {/* No aspect-ratio container: render the image at its natural shape
             (here 16:9 landscape) so it isn't cropped. */}
          <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-[1.5rem] shadow-glow-lg ring-1 ring-black/5 sm:rounded-[2rem] sm:shadow-2xl lg:max-w-none">
            <Image
              src={HERO_IMAGE}
              alt="An AI-rendered wedding venue example produced on the platform"
              width={1376}
              height={768}
              sizes="(min-width: 1024px) 40vw, 92vw"
              priority
              className="block h-auto w-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          </div>
        </div>

        <div className="lg:col-span-6 lg:col-start-1 lg:row-start-2 lg:self-start">
          <div
            style={{ animationDelay: "0.25s" }}
            className="hero-rise flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            {/* Primary CTA — the free path. Cold visitors land in the
                designer at `/venue-designer/new`, where the middleware
                mints an anonymous session and the email gate kicks in
                after the first generation. No payment surface in front
                of the wow. */}
            <Button
              variant="cta"
              size="xl"
              render={<Link href="/venue-designer/new" />}
              className="group w-full sm:w-auto sm:px-8"
            >
              {t("heroCtaFree")}
              <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Button>
            {/* Secondary CTA — no longer a purchase ask. Per ZAF-18/ZAF-19,
                the fold shouldn't ask for money before a visitor knows what
                a concierge even is; this is a same-page anchor into
                How It Works instead. Mirrors the primary CTA's
                `render={<Link .../>}` pattern; no pending/async state since
                there's nothing to await. */}
            <Button
              size="lg"
              variant="outline"
              render={<Link href="#how-it-works" />}
              className="h-12 w-full gap-2 border-rose-200/80 bg-white px-6 text-base text-rose-700 hover:bg-rose-50/70 hover:text-rose-700 sm:w-auto sm:px-8 dark:border-rose-900/40 dark:bg-card dark:text-rose-200 dark:hover:bg-rose-950/20 dark:hover:text-rose-200"
            >
              {t("heroCtaSecondary")}
            </Button>
          </div>

          <p
            style={{ animationDelay: "0.3s" }}
            className="hero-rise mt-3 text-xs text-muted-foreground"
          >
            {t("heroCtaHint")}
          </p>

          {/* Real proof, injected from a server component: renders from
              couples who opted into the public gallery, plus a live count.
              Previously four Unsplash stock headshots and an invented 4.9. */}
          {socialProof}
        </div>
      </div>
    </section>
  );
}
