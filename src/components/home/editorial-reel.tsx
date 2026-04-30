"use client";

import Image from "next/image";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { useRef } from "react";
import { SplitText } from "./split-text";

interface Story {
  couple: string;
  location: string;
  planner: string;
  image: string;
  pull: string;
  body: string;
}

// Each story shows the VENUE we'd design — not a couple. The product is the
// venue; the copy carries the romance.
const STORIES: Story[] = [
  {
    couple: "Mariam & Karim",
    location: "Sahel, Egypt",
    planner: "Atelier Nour",
    // Hundreds of candles glowing in harmony — matches "two hundred candles, one long table" (Pinterest)
    image:
      "https://i.pinimg.com/originals/f5/40/d1/f540d1840a8a6591b96e7db26d8e7396.jpg",
    pull: "A garden the color of sunset.",
    body:
      "Two hundred candles, one long table, and the quiet certainty that everything was where it was meant to be.",
  },
  {
    couple: "Layla & Omar",
    location: "Cairo, Egypt",
    planner: "Maison Hassan",
    // Opulent chandeliers, hand-painted ceilings, endless candlelight — exactly "half-cinema, half-cathedral" (Pinterest)
    image:
      "https://i.pinimg.com/originals/48/b8/e4/48b8e4a9eaaaf140764b4f4527e9265c.jpg",
    pull: "Gold, candlelight, and quiet glamour.",
    body:
      "A reception that felt half-cinema, half-cathedral. Designed in three weeks, remembered for a lifetime.",
  },
  {
    couple: "Nour & Adam",
    location: "El Gouna",
    planner: "Habiba & Co.",
    // Tropical sunset wooden arch with florals — outdoor beach wedding venue (Pinterest)
    image:
      "https://i.pinimg.com/originals/0c/c2/87/0cc287a3dbe52c0bbcc25eba40c9ebd7.jpg",
    pull: "A barefoot vow at golden hour.",
    body:
      "The sea turned amber. Our planner had the shoes off the bridesmaids before the first photograph.",
  },
];

export function EditorialReel() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-background via-rose-50/30 to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-7xl champagne-hairline"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/3 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl"
      />

      <div className="container relative mx-auto max-w-7xl px-4 pt-28 pb-12 md:pt-36 md:pb-16">
        <p className="mb-4 text-[0.7rem] uppercase tracking-[0.3em] text-rose-700">
          After the render
        </p>
        <h2 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight md:text-7xl">
          <SplitText>Days that lived</SplitText>
          <br />
          <span className="italic text-muted-foreground">
            <SplitText delay={0.3}>up to the dream.</SplitText>
          </span>
        </h2>
        <p className="mt-6 max-w-xl text-pretty text-base text-muted-foreground md:text-lg">
          Three real couples. Three palettes locked, three rooms rendered, three
          nights remembered. This is what happens after the still becomes a
          scene.
        </p>
      </div>

      <div className="relative space-y-24 pb-32 md:space-y-40">
        {STORIES.map((story, i) => (
          <Spread key={story.couple} story={story} reverse={i % 2 === 1} />
        ))}
      </div>
    </section>
  );
}

function Spread({ story, reverse }: { story: Story; reverse: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [80, -80]);
  const scale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    reduce ? [1, 1, 1] : [1.18, 1.05, 1],
  );

  return (
    <article
      ref={ref}
      className={`container mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 lg:grid-cols-12 lg:gap-16 ${
        reverse ? "lg:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-muted shadow-xl ring-1 ring-black/5 lg:col-span-7 lg:aspect-[4/5]">
        <motion.div style={{ y, scale }} className="absolute inset-[-10%]">
          <Image
            src={story.image}
            alt={`${story.couple} wedding planned by ${story.planner}`}
            fill
            sizes="(min-width: 1024px) 60vw, 90vw"
            className="object-cover"
          />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 text-white md:p-8">
          <div>
            <p className="font-display text-2xl font-light leading-tight md:text-4xl">
              {story.couple}
            </p>
            <p className="mt-1 text-[0.7rem] uppercase tracking-[0.2em] text-white/70">
              {story.location}
            </p>
          </div>
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-white/70">
            {story.planner}
          </p>
        </div>
      </div>

      <div className="lg:col-span-5">
        <motion.blockquote
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-balance text-3xl font-light leading-[1.1] tracking-tight md:text-5xl"
        >
          &ldquo;{story.pull}&rdquo;
        </motion.blockquote>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{
            duration: 0.9,
            delay: 0.15,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="mt-6 max-w-md text-pretty text-base text-muted-foreground md:text-lg"
        >
          {story.body}
        </motion.p>
      </div>
    </article>
  );
}
