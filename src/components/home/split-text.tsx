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

// Scripts that join contextually (Arabic, Hebrew, Syriac, Thaana, NKo, Indic).
// Splitting these character-by-character forces each glyph into its isolated
// form and breaks letter shaping — so we fall back to word-level animation.
const CURSIVE_SCRIPT_REGEX =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/;

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
  const effectiveBy =
    by === "char" && CURSIVE_SCRIPT_REGEX.test(children) ? "word" : by;

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
          {effectiveBy === "word" ? (
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
