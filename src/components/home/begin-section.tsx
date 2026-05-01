"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

// Four warm, on-palette editorial details — the "what's on your moodboard"
// preview for the final invitation.
const COLLAGE = [
  {
    // Long candlelit tablescape detail
    src: "https://images.unsplash.com/photo-1738669469820-259d9c7189bb?auto=format&fit=crop&w=900&q=85",
    alt: "A long table set with flowers and candles",
    cls: "start-[6%] top-[8%] h-44 w-32 rotate-[-6deg] sm:h-56 sm:w-40",
  },
  {
    // Pale pink and cream rose bouquet
    src: "https://images.unsplash.com/photo-1774975433902-a79ace1d6fa5?auto=format&fit=crop&w=900&q=85",
    alt: "A bouquet of pale pink and cream roses",
    cls: "end-[8%] top-[14%] h-40 w-32 rotate-[5deg] sm:h-52 sm:w-40",
  },
  {
    // Beach wedding setup at sunset with warm florals (Pinterest)
    src: "https://i.pinimg.com/originals/15/fe/65/15fe6548657b7f5778dfd81837356273.jpg",
    alt: "A beach wedding setup at sunset with warm florals",
    cls: "start-[14%] bottom-[10%] h-44 w-32 rotate-[3deg] sm:h-56 sm:w-40",
  },
  {
    // Champagne-toned wedding tablescape with ivory florals (Pinterest)
    src: "https://i.pinimg.com/originals/a3/15/cf/a315cf34bfe1ea4cd3da22875a0fb24d.png",
    alt: "A champagne-toned wedding tablescape styled with ivory florals",
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

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 pt-32 pb-32 md:pt-40 md:pb-44 lg:grid-cols-12 lg:gap-16">
        {/* Copy */}
        <div className="relative z-10 flex flex-col justify-center lg:col-span-7">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.7 }}
            className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-rose-200/60 bg-white/70 px-4 py-1.5 text-[0.7rem] uppercase tracking-[0.3em] text-rose-700 backdrop-blur-md"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("beginEyebrow")}
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.9, delay: 0.05 }}
            className="font-display text-balance text-[clamp(2.5rem,5.5vw,5rem)] font-light leading-[0.95] tracking-tight"
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
            className="mt-6 max-w-xl text-pretty text-base text-muted-foreground md:text-lg"
          >
            {t("beginSubtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.7, delay: 0.25 }}
            className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Button
              size="lg"
              render={<Link href="/venue-designer" />}
              className="group h-12 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-8 text-base text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90 hover:shadow-rose-600/30"
            >
              {t("beginCta")}
              <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Button>
            <p className="text-xs text-muted-foreground sm:ms-2">
              {t("beginCtaHint")}
            </p>
          </motion.div>

          {/* Press / trust line */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: reduce ? 0 : 0.8, delay: 0.4 }}
            className="mt-16 max-w-xl"
          >
            <p className="mb-3 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
              {t("beginAsSeenIn")}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-foreground/65">
              {PRESS.map((p, i) => (
                <span key={p} className="flex items-center gap-5">
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

        {/* Editorial collage */}
        <div className="relative lg:col-span-5">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-md lg:absolute lg:inset-0 lg:mx-0 lg:max-w-none">
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
      </div>
    </section>
  );
}
