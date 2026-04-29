"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useRef } from "react";

const STATS = [
  { value: 500, suffix: "+", label: "Curated planners" },
  { value: 2000, suffix: "+", label: "Verified vendors" },
  { value: 10000, suffix: "+", label: "Events planned" },
  { value: 4.9, suffix: "", label: "Average rating", decimals: 1 },
] as const;

export function StatsBand() {
  return (
    <section className="bg-background">
      <div className="container mx-auto max-w-7xl px-4 py-20 md:py-28">
        <div className="grid grid-cols-2 divide-y divide-foreground/10 md:grid-cols-4 md:divide-x md:divide-y-0">
          {STATS.map((stat, i) => (
            <Stat key={stat.label} {...stat} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface StatProps {
  value: number;
  suffix: string;
  label: string;
  decimals?: number;
  index: number;
}

function Stat({ value, suffix, label, decimals = 0, index }: StatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const reduce = useReducedMotion();

  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (latest) =>
    decimals > 0
      ? latest.toFixed(decimals)
      : Math.round(latest).toLocaleString(),
  );

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration: 1.8,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [inView, motionValue, reduce, value]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{
        duration: 0.7,
        delay: index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="px-4 py-6 first:pt-0 md:py-2 md:first:pt-2 md:first:pl-0"
    >
      <div className="font-display text-4xl font-light leading-none tracking-tight md:text-6xl">
        <motion.span>{display}</motion.span>
        <span className="text-muted-foreground">{suffix}</span>
      </div>
      <p className="mt-3 text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </p>
    </motion.div>
  );
}
