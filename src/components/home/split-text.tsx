"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { type ReactNode } from "react";

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

const child: Variants = {
  hidden: { y: "110%", opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
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

  const words = children.split(" ");

  return (
    <motion.span
      className={className}
      variants={container(delay, stagger)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-10% 0px" }}
      style={{ display: "inline-block" }}
    >
      {words.map((word, wIndex) => (
        <span
          key={wIndex}
          style={{
            display: "inline-block",
            whiteSpace: "nowrap",
            marginRight: wIndex < words.length - 1 ? "0.25em" : 0,
          }}
        >
          {by === "word" ? (
            <Token>{word}</Token>
          ) : (
            word.split("").map((ch, i) => (
              <Token key={i}>{ch}</Token>
            ))
          )}
        </span>
      ))}
    </motion.span>
  );
}

function Token({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        overflow: "hidden",
        verticalAlign: "top",
        lineHeight: "inherit",
      }}
    >
      <motion.span variants={child} style={{ display: "inline-block" }}>
        {children}
      </motion.span>
    </span>
  );
}
