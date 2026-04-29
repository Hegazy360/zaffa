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

const STORIES: Story[] = [
  {
    couple: "Mariam & Karim",
    location: "Sahel, Egypt",
    planner: "Atelier Nour",
    image:
      "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1600&q=85",
    pull: "A garden the color of sunset.",
    body:
      "Two hundred candles, one long table, and the quiet certainty that everything was where it was meant to be.",
  },
  {
    couple: "Layla & Omar",
    location: "Cairo, Egypt",
    planner: "Maison Hassan",
    image:
      "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1600&q=85",
    pull: "Gold, candlelight, and quiet glamour.",
    body:
      "A reception that felt half-cinema, half-cathedral. Designed in three weeks, remembered for a lifetime.",
  },
  {
    couple: "Nour & Adam",
    location: "El Gouna",
    planner: "Habiba & Co.",
    image:
      "https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=1600&q=85",
    pull: "A barefoot vow at golden hour.",
    body:
      "The sea turned amber. Our planner had the shoes off the bridesmaids before the first photograph.",
  },
];

export function EditorialReel() {
  return (
    <section className="bg-background">
      <div className="container mx-auto max-w-7xl px-4 pt-24 pb-12 md:pt-32 md:pb-16">
        <p className="mb-4 text-[0.7rem] uppercase tracking-[0.3em] text-rose-600">
          Real love stories
        </p>
        <h2 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight md:text-7xl">
          <SplitText>Days that lived</SplitText>
          <br />
          <span className="italic text-muted-foreground">
            <SplitText delay={0.3}>up to the dream.</SplitText>
          </span>
        </h2>
      </div>

      <div className="space-y-24 pb-32 md:space-y-40">
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
