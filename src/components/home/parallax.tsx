"use client";

import {
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { type RefObject } from "react";

/**
 * Returns a smoothed MotionValue mapped from element scroll progress (0..1)
 * to the provided output range. Returns a constant 0 when the user prefers
 * reduced motion.
 */
export function useParallax<T extends HTMLElement>(
  ref: RefObject<T | null>,
  output: [number, number] = [-60, 60],
  offset: ["start end", "end start"] | ["start start", "end end"] = [
    "start end",
    "end start",
  ],
): MotionValue<number> {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset,
  });

  const transformed = useTransform(
    scrollYProgress,
    [0, 1],
    reduce ? [0, 0] : output,
  );

  return useSpring(transformed, {
    stiffness: 90,
    damping: 22,
    mass: 0.4,
  });
}
