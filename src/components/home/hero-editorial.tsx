"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParallax } from "./parallax";

const HERO_IMAGES = {
  primary:
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1400&q=80",
  secondary:
    "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=900&q=80",
  tertiary:
    "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=900&q=80",
} as const;

export function HeroEditorial() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  const yPrimary = useParallax(sectionRef, [60, -60]);
  const ySecondary = useParallax(sectionRef, [-40, 40]);
  const yTertiary = useParallax(sectionRef, [80, -40]);

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden bg-gradient-to-b from-rose-50/60 via-background to-background dark:from-rose-950/20"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-32 h-[36rem] w-[36rem] rounded-full bg-gradient-to-br from-rose-200/40 to-amber-200/30 blur-3xl dark:from-rose-900/20 dark:to-amber-900/10"
      />

      <div className="container relative mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 pt-20 pb-24 md:pt-28 md:pb-32 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col justify-center lg:col-span-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.6 }}
            className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-rose-200/60 bg-white/60 px-4 py-1.5 text-xs uppercase tracking-[0.18em] text-rose-700 backdrop-blur-md dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Egypt&rsquo;s premier event atelier
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.9, delay: 0.05 }}
            className="font-display text-balance text-[clamp(2.75rem,7vw,6rem)] font-light leading-[0.95] tracking-tight"
          >
            Your{" "}
            <span className="font-arabic font-medium text-rose-600 dark:text-rose-300">
              زفّة
            </span>
            ,
            <br />
            <span className="italic">expertly</span>{" "}
            <span className="bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 bg-clip-text text-transparent">
              imagined.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.7, delay: 0.15 }}
            className="mt-6 max-w-xl text-pretty text-base text-muted-foreground md:text-lg"
          >
            From a quiet color story to a candlelit cathedral, Zaffa pairs you
            with Egypt&rsquo;s finest planners, vendors, and AI atelier &mdash;
            so every detail of your day feels inevitable.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.7, delay: 0.25 }}
            className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Button
              size="lg"
              render={<Link href="/venue-designer" />}
              className="group h-12 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-8 text-base text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90 hover:shadow-rose-600/30"
            >
              Design Your Venue
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.8, delay: 0.4 }}
            className="mt-12 flex items-center gap-6"
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
                Loved by 10,000+ couples across Egypt
              </p>
            </div>
          </motion.div>
        </div>

        <div className="relative lg:col-span-6">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-md lg:max-w-none">
            <motion.div
              style={{ y: yPrimary }}
              className="absolute inset-0 z-20 overflow-hidden rounded-[2rem] shadow-2xl shadow-rose-900/10 ring-1 ring-black/5"
            >
              <Image
                src={HERO_IMAGES.primary}
                alt="An elegant rose and eucalyptus centerpiece on a candlelit table"
                fill
                sizes="(min-width: 1024px) 40vw, 90vw"
                priority
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
            </motion.div>

            <motion.div
              style={{ y: ySecondary }}
              className="absolute -left-6 -top-6 z-30 hidden h-40 w-32 overflow-hidden rounded-2xl shadow-xl shadow-rose-900/15 ring-1 ring-black/5 sm:block md:h-52 md:w-40 lg:-left-10"
            >
              <Image
                src={HERO_IMAGES.secondary}
                alt="Bohemian outdoor ceremony"
                fill
                sizes="200px"
                className="object-cover"
              />
            </motion.div>

            <motion.div
              style={{ y: yTertiary }}
              className="absolute -bottom-8 -right-4 z-30 hidden h-44 w-36 overflow-hidden rounded-2xl shadow-xl shadow-rose-900/15 ring-1 ring-black/5 sm:block md:h-56 md:w-44 lg:-right-10"
            >
              <Image
                src={HERO_IMAGES.tertiary}
                alt="Romantic candlelit reception"
                fill
                sizes="220px"
                className="object-cover"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.8, delay: 0.5 }}
              className="absolute -bottom-2 left-1/2 z-40 flex w-[88%] -translate-x-1/2 items-center gap-3 rounded-2xl border bg-background/85 p-3 shadow-xl backdrop-blur-md sm:left-4 sm:w-auto sm:max-w-xs sm:translate-x-0"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-100 to-amber-100 dark:from-rose-900/40 dark:to-amber-900/40">
                <Sparkles className="h-5 w-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight">
                  AI Style Match
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Garden romance &middot; warm ivory &middot; rose
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {!reduce && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 lg:block"
        >
          <div className="flex h-9 w-6 items-start justify-center rounded-full border border-foreground/30">
            <motion.div
              animate={{ y: [4, 14, 4] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="mt-1.5 h-1.5 w-1 rounded-full bg-foreground/50"
            />
          </div>
        </motion.div>
      )}
    </section>
  );
}
