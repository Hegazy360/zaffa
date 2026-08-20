"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Entrance motion that never hides content.
 *
 * The pattern this replaces is `motion.div initial={{ opacity: 0, y: 24 }}`
 * with a `whileInView`. framer-motion renders `initial` into the server HTML
 * as `style="opacity:0"`, so every one of those sections is **invisible in the
 * server response** and stays invisible until the JavaScript bundle loads,
 * hydrates, and an IntersectionObserver fires. On a slow connection — the
 * connection this product's market actually has — that is a blank page where
 * the pitch should be. If the bundle fails, it is a blank page permanently.
 * The hero already learned this and moved to CSS; this is the same fix for the
 * other eighteen.
 *
 * Here, the element is visible in the server HTML and stays visible. The
 * animation is added by an effect, which by definition only runs once JS is
 * live: the class sets `opacity: 0` and animates back, so the fade happens
 * only for people who were going to see it anyway. No JS, no bundle, an
 * ancient browser — the content is simply there.
 *
 * Reduced motion needs no handling here. The global block in `globals.css`
 * collapses `animation-duration`, and `both` fill-mode settles the element at
 * its final state immediately.
 */
export function Rise({
  children,
  delay = 0,
  className,
  as: Tag = "div",
  ...rest
}: {
  children: React.ReactNode;
  /** Stagger, in seconds. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "header" | "ul" | "li" | "article";
} & React.HTMLAttributes<HTMLElement>) {
  // `HTMLElement`, and the cast below, because `as` can be any of five tags
  // and TypeScript will not unify their ref types on a polymorphic component
  // without far more machinery than this earns.
  const ref = React.useRef<HTMLElement>(null);
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Already on screen at mount — above the fold. Animating it would mean
    // fading in something the reader is already looking at, so it just stays.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setArmed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as unknown as React.Ref<never>}
      style={armed ? ({ animationDelay: `${delay}s` } as React.CSSProperties) : undefined}
      className={cn(armed && "hero-rise", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
