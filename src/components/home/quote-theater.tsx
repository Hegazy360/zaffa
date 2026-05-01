"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

interface Quote {
  quote: string;
  author: string;
  role: string;
  avatar: string;
}

const QUOTES: Quote[] = [
  {
    quote:
      "Zaffa took the noise out of planning. The 3D preview saved us a dozen meetings, and the day itself felt effortless.",
    author: "Mariam H.",
    role: "Bride, Sahel 2025",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
  },
  {
    quote:
      "The AI style match was uncannily on-brief. We approved the moodboard on a Sunday and started receiving planner proposals by Tuesday.",
    author: "Layla K.",
    role: "Bride, Cairo 2025",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80",
  },
  {
    quote:
      "Every vendor came pre-vetted. Every contract, payment, and timeline lived in one quiet workspace. I just kept being told the day was perfect.",
    author: "Salma Y.",
    role: "Bride, Alexandria 2024",
    avatar:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80",
  },
  {
    quote:
      "I&rsquo;ve booked through Zaffa twice now &mdash; once as a client, once for a corporate event. The bar keeps rising.",
    author: "Yara M.",
    role: "Repeat client, Cairo",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80",
  },
];

const ROTATION_MS = 6000;

export function QuoteTheater() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(
    () => setIndex((i) => (i + 1) % QUOTES.length),
    [],
  );

  useEffect(() => {
    if (reduce || paused) return;
    const id = window.setInterval(next, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [next, paused, reduce]);

  const current = QUOTES[index];

  return (
    <section
      className="relative overflow-hidden bg-background py-32 md:py-40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[1px] max-w-7xl champagne-hairline"
      />

      <div className="container mx-auto max-w-5xl px-4 text-center">
        <p className="mb-12 text-[0.7rem] uppercase tracking-[0.3em] text-rose-600 md:mb-16">
          What couples say
        </p>

        <div className="relative min-h-[280px] md:min-h-[360px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -16, filter: "blur(8px)" }}
              transition={{
                duration: reduce ? 0 : 0.9,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="absolute inset-0 flex flex-col items-center"
            >
              <p
                className="font-display text-balance text-2xl font-light leading-[1.2] tracking-tight md:text-5xl"
                dangerouslySetInnerHTML={{
                  __html: `&ldquo;${current.quote}&rdquo;`,
                }}
              />

              <div className="mt-12 flex items-center gap-3">
                <div className="relative h-10 w-10 overflow-hidden rounded-full ring-2 ring-background">
                  <Image
                    src={current.avatar}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
                <div className="text-start">
                  <p className="text-sm font-medium">{current.author}</p>
                  <p className="text-xs text-muted-foreground">
                    {current.role}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative z-10 mt-12 flex items-center justify-center gap-2">
          {QUOTES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show testimonial ${i + 1}`}
              className="group relative h-1 w-10 overflow-hidden rounded-full bg-foreground/15 transition-colors"
            >
              <motion.span
                aria-hidden
                initial={false}
                animate={{
                  width: i === index ? "100%" : "0%",
                }}
                transition={{
                  duration:
                    reduce || paused || i !== index ? 0 : ROTATION_MS / 1000,
                  ease: "linear",
                }}
                className="absolute inset-y-0 start-0 bg-foreground"
              />
            </button>
          ))}
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-[1px] max-w-7xl champagne-hairline"
      />
    </section>
  );
}
