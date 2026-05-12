"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVisionPackPricing } from "@/components/vision-pack/use-pricing";

// Four AI-rendered examples produced on the platform — the "what's on your
// moodboard" preview for the final invitation. Tile positions/rotations are
// tuned for visual rhythm and don't depend on the specific image.
const COLLAGE = [
  {
    src: "/home/examples/collage-1.jpeg",
    alt: "An AI-rendered wedding venue example",
    cls: "start-[6%] top-[8%] h-44 w-32 rotate-[-6deg] sm:h-56 sm:w-40",
  },
  {
    src: "/home/examples/collage-2.png",
    alt: "An AI-rendered wedding venue example",
    cls: "end-[8%] top-[14%] h-40 w-32 rotate-[5deg] sm:h-52 sm:w-40",
  },
  {
    src: "/home/examples/collage-3.png",
    alt: "An AI-rendered wedding venue example",
    cls: "start-[14%] bottom-[10%] h-44 w-32 rotate-[3deg] sm:h-56 sm:w-40",
  },
  {
    src: "/home/examples/collage-4.png",
    alt: "An AI-rendered wedding venue example",
    cls: "end-[12%] bottom-[14%] h-40 w-32 rotate-[-4deg] sm:h-52 sm:w-40",
  },
] as const;

const PRESS = [
  "Vogue Arabia",
  "Brides Magazine",
  "Harper's Bazaar",
  "Cairo Scene",
  "Identity",
];

export function BeginSection() {
  const reduce = useReducedMotion();
  const pricing = useVisionPackPricing();
  const t = useTranslations("marketing");

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-background via-rose-50/40 to-amber-50/30">
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 start-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/45 to-amber-200/35 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-7xl champagne-hairline"
      />

      {/* Same two-row × 12-col trick as the hero: on mobile the collage falls
          between the subtitle and the CTA in DOM order, so the visual lands
          before the call-to-action instead of being buried below the press
          line. On desktop the collage cell spans both rows of the right
          column and the copy reads as a single centred column — pixel for
          pixel the same as the original. */}
      <div className="container relative mx-auto grid max-w-7xl gap-y-10 px-4 pt-24 pb-24 sm:pt-32 sm:pb-32 md:pt-40 md:pb-44 lg:grid-cols-12 lg:gap-x-16 lg:gap-y-10">
        <div className="relative z-10 lg:col-span-7 lg:row-start-1 lg:self-end">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.7 }}
            className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-rose-200/60 bg-white/70 px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.28em] text-rose-700 backdrop-blur-md sm:mb-6 sm:px-4 sm:text-[0.7rem] sm:tracking-[0.3em]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("beginEyebrow")}
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.9, delay: 0.05 }}
            className="font-display text-balance text-[clamp(2.25rem,8vw,5rem)] font-light leading-[1.05] tracking-tight sm:text-[clamp(2.5rem,5.5vw,5rem)] sm:leading-[0.95]"
          >
            {t("beginTitlePart1")}{" "}
            <span className="italic">{t("beginTitleItalic")}</span>
            <br />
            {t("beginTitleConnector")}{" "}
            <span className="bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 bg-clip-text text-transparent">
              {t("beginTitleHighlight")}
            </span>{" "}
            {t("beginTitleTail")}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.7, delay: 0.15 }}
            className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:mt-6 md:text-lg"
          >
            {t("beginSubtitle", { price: pricing.label })}
          </motion.p>
        </div>

        <div className="relative lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-sm sm:max-w-md lg:absolute lg:inset-0 lg:mx-0 lg:max-w-none">
            {COLLAGE.map((c, i) => (
              <motion.div
                key={c.src}
                initial={{ opacity: 0, y: 24, rotate: 0 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-15% 0px" }}
                transition={{
                  duration: reduce ? 0 : 0.9,
                  delay: 0.1 + i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className={`absolute overflow-hidden rounded-2xl shadow-xl shadow-rose-900/15 ring-1 ring-rose-900/10 ${c.cls}`}
              >
                <Image
                  src={c.src}
                  alt={c.alt}
                  fill
                  sizes="(min-width: 1024px) 22vw, 40vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 lg:col-span-7 lg:col-start-1 lg:row-start-2 lg:self-start">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.7, delay: 0.25 }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            {/* Primary free CTA — symmetrical with the hero so the
                conversion path is consistent top-to-bottom on the page. */}
            <Button
              size="lg"
              render={<Link href="/venue-designer/new" />}
              className="group h-12 w-full gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-6 text-base text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90 hover:shadow-rose-600/30 sm:w-auto sm:px-8"
            >
              {t("heroCtaFree")}
              <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/venue-designer" />}
              className="h-12 w-full gap-2 border-rose-200/80 bg-white px-6 text-base text-rose-700 hover:bg-rose-50/70 hover:text-rose-700 sm:w-auto sm:px-8 dark:border-rose-900/40 dark:bg-card dark:text-rose-200 dark:hover:bg-rose-950/20 dark:hover:text-rose-200"
            >
              {t("beginCta", { price: pricing.label })}
            </Button>
          </motion.div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("beginCtaHint")}
          </p>

          {/* Press / trust line */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.8, delay: 0.4 }}
            className="mt-12 max-w-xl sm:mt-16"
          >
            <p className="mb-3 text-[0.6rem] uppercase tracking-[0.28em] text-muted-foreground sm:text-[0.65rem] sm:tracking-[0.3em]">
              {t("beginAsSeenIn")}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground/65 sm:gap-x-5">
              {PRESS.map((p, i) => (
                <span key={p} className="flex items-center gap-4 sm:gap-5">
                  <span className="font-display italic font-light tracking-tight">
                    {p}
                  </span>
                  {i < PRESS.length - 1 && (
                    <span className="h-1 w-1 rounded-full bg-rose-400/50" />
                  )}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
