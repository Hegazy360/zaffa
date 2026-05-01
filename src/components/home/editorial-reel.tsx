"use client";

import Image from "next/image";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { SplitText } from "./split-text";

interface Story {
  coupleKey: "reelStory1Couple" | "reelStory2Couple" | "reelStory3Couple";
  locationKey:
    | "reelStory1Location"
    | "reelStory2Location"
    | "reelStory3Location";
  plannerKey: "reelStory1Planner" | "reelStory2Planner" | "reelStory3Planner";
  pullKey: "reelStory1Pull" | "reelStory2Pull" | "reelStory3Pull";
  bodyKey: "reelStory1Body" | "reelStory2Body" | "reelStory3Body";
  image: string;
}

const STORIES: Story[] = [
  {
    coupleKey: "reelStory1Couple",
    locationKey: "reelStory1Location",
    plannerKey: "reelStory1Planner",
    pullKey: "reelStory1Pull",
    bodyKey: "reelStory1Body",
    image:
      "https://i.pinimg.com/originals/f5/40/d1/f540d1840a8a6591b96e7db26d8e7396.jpg",
  },
  {
    coupleKey: "reelStory2Couple",
    locationKey: "reelStory2Location",
    plannerKey: "reelStory2Planner",
    pullKey: "reelStory2Pull",
    bodyKey: "reelStory2Body",
    image:
      "https://i.pinimg.com/originals/48/b8/e4/48b8e4a9eaaaf140764b4f4527e9265c.jpg",
  },
  {
    coupleKey: "reelStory3Couple",
    locationKey: "reelStory3Location",
    plannerKey: "reelStory3Planner",
    pullKey: "reelStory3Pull",
    bodyKey: "reelStory3Body",
    image:
      "https://i.pinimg.com/originals/0c/c2/87/0cc287a3dbe52c0bbcc25eba40c9ebd7.jpg",
  },
];

export function EditorialReel() {
  const t = useTranslations("marketing");
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
        className="pointer-events-none absolute -start-32 top-1/3 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl"
      />

      <div className="container relative mx-auto max-w-7xl px-4 pt-28 pb-12 md:pt-36 md:pb-16">
        <p className="mb-4 text-[0.7rem] uppercase tracking-[0.3em] text-rose-700">
          {t("reelEyebrow")}
        </p>
        <h2 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight md:text-7xl">
          <SplitText>{t("reelTitleLine1")}</SplitText>
          <br />
          <span className="italic text-muted-foreground">
            <SplitText delay={0.3}>{t("reelTitleLine2")}</SplitText>
          </span>
        </h2>
        <p className="mt-6 max-w-xl text-pretty text-base text-muted-foreground md:text-lg">
          {t("reelSubtitle")}
        </p>
      </div>

      <div className="relative space-y-24 pb-32 md:space-y-40">
        {STORIES.map((story, i) => (
          <Spread key={story.coupleKey} story={story} reverse={i % 2 === 1} />
        ))}
      </div>
    </section>
  );
}

function Spread({ story, reverse }: { story: Story; reverse: boolean }) {
  const t = useTranslations("marketing");
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

  const couple = t(story.coupleKey);
  const planner = t(story.plannerKey);

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
            alt={t("reelImageAlt", { couple, planner })}
            fill
            sizes="(min-width: 1024px) 60vw, 90vw"
            className="object-cover"
          />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 text-white md:p-8">
          <div>
            <p className="font-display text-2xl font-light leading-tight md:text-4xl">
              {couple}
            </p>
            <p className="mt-1 text-[0.7rem] uppercase tracking-[0.2em] text-white/70">
              {t(story.locationKey)}
            </p>
          </div>
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-white/70">
            {planner}
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
          &ldquo;{t(story.pullKey)}&rdquo;
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
          {t(story.bodyKey)}
        </motion.p>
      </div>
    </article>
  );
}
