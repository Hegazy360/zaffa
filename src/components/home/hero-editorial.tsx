"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVisionPackPricing } from "@/components/vision-pack/use-pricing";

// One AI-rendered example — a representative output of the kind of room our
// platform helps couples design. Static (no parallax) so the hero reads as a
// magazine spread, not an interactive toy.
const HERO_IMAGE = "/home/examples/hero.jpeg";

export function HeroEditorial() {
  const reduce = useReducedMotion();
  const t = useTranslations("marketing");
  const pricing = useVisionPackPricing();

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
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.6 }}
            className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-rose-200/60 bg-white/60 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-rose-700 backdrop-blur-md sm:mb-6 sm:px-4 sm:text-xs dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("heroEyebrow", { price: pricing.label })}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.9, delay: 0.05 }}
            className="font-display text-balance text-[clamp(2.25rem,9vw,5.25rem)] font-light leading-[1.05] tracking-tight sm:text-[clamp(2.5rem,6.5vw,5.25rem)] sm:leading-[1]"
          >
            {t("heroTitlePart1")}{" "}
            <span className="italic">{t("heroTitleItalic")}</span>{" "}
            <span className="bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 bg-clip-text text-transparent">
              {t("heroTitleHighlight")}
            </span>{" "}
            {t("heroTitleTail")}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.7, delay: 0.15 }}
            className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:mt-6 md:text-lg"
          >
            {t("heroSubtitle")}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.9, delay: 0.2 }}
          className="relative lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:flex lg:items-center"
        >
          {/* No aspect-ratio container: render the image at its natural shape
             (here 16:9 landscape) so it isn't cropped. */}
          <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-[1.5rem] shadow-xl shadow-rose-900/10 ring-1 ring-black/5 sm:rounded-[2rem] sm:shadow-2xl lg:max-w-none">
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
        </motion.div>

        <div className="lg:col-span-6 lg:col-start-1 lg:row-start-2 lg:self-start">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.7, delay: 0.25 }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Button
              size="lg"
              render={<Link href="/venue-designer" />}
              className="group h-12 w-full gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-6 text-base text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90 hover:shadow-rose-600/30 sm:w-auto sm:px-8"
            >
              {t("heroCta", { price: pricing.label })}
              <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Button>
            <p className="text-xs text-muted-foreground sm:ms-2">
              {t("heroCtaHint")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.8, delay: 0.4 }}
            className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-x-6"
          >
            <div className="flex -space-x-3">
              {[
                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
                "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=120&q=80",
                "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80",
                "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80",
              ].map((src, i) => (
                <div
                  key={src}
                  className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-background"
                  style={{ zIndex: 4 - i }}
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-3.5 w-3.5 fill-amber-500 text-amber-500"
                    />
                  ))}
                </div>
                <span className="text-sm font-semibold">4.9</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("heroSocialProof")}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
