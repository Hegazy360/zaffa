"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { type ReactNode, Fragment } from "react";

interface SplitTextProps {
  children: string;
  className?: string;
  delay?: number;
  stagger?: number;
  by?: "char" | "word";
  once?: boolean;
}

const container = (delay: number, stagger: number): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger,
      delayChildren: delay,
    },
  },
});

// Subtle rise + fade. Avoids clipping descenders/italic strokes — the previous
// implementation wrapped each char in `overflow:hidden`, which cut italic
// letters and any descender, and word-margins got eaten by `text-balance`.
const child: Variants = {
  hidden: { y: "0.4em", opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

export function SplitText({
  children,
  className,
  delay = 0,
  stagger = 0.025,
  by = "char",
  once = true,
}: SplitTextProps) {
  const reduce = useReducedMotion();

  if (reduce) return <span className={className}>{children}</span>;

  // Split into words while preserving the spaces as plain text nodes so the
  // browser can wrap, kern, and balance lines naturally.
  const words = children.split(" ");

  return (
    <motion.span
      className={className}
      variants={container(delay, stagger)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-10% 0px" }}
      // `inline` (not inline-block) so `text-balance` and word-wrap behave.
      style={{ display: "inline" }}
    >
      {words.map((word, wIndex) => (
        <Fragment key={wIndex}>
          {by === "word" ? (
            <Token>{word}</Token>
          ) : (
            // Wrap word characters in a nowrap span so a single word never
            // breaks across lines mid-letter, but the inter-word space stays
            // a real space the browser can collapse / break on.
            <span style={{ whiteSpace: "nowrap" }}>
              {word.split("").map((ch, i) => (
                <Token key={i}>{ch}</Token>
              ))}
            </span>
          )}
          {wIndex < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </motion.span>
  );
}

function Token({ children }: { children: ReactNode }) {
  return (
    <motion.span variants={child} style={{ display: "inline-block" }}>
      {children}
    </motion.span>
  );
}
