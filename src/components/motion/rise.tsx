import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll reveal, driven entirely by CSS.
 *
 * This has been through two wrong shapes, and the reasons are worth keeping:
 *
 *  1. `motion.div initial={{ opacity: 0 }}`, framer-motion renders that
 *     `initial` into the server HTML as `style="opacity:0"`, so the section
 *     was **invisible in the server response** until the bundle loaded and
 *     hydrated. On this product's market - mobile, cellular - that is a blank
 *     page where the pitch should be.
 *  2. An IntersectionObserver that added the animation class on intersection.
 *     The content shipped visible (good), but the class carries
 *     `opacity: 0` as its start state, and the observer fires when the
 *     element is already 10% inside the viewport, so a section the reader
 *     could already see **blinked out and faded back in**. That is the
 *     "glitchy scroll" the founder reported, and it was in every one of the
 *     nineteen sections at once.
 *
 * The fix removes JavaScript from the scroll path altogether. A scroll-driven
 * animation (`animation-timeline: view()`) is evaluated by the compositor
 * against scroll position, so it cannot flash - the element's opacity is a
 * pure function of where it sits in the viewport, and it cannot jank the
 * main thread, because the main thread is not involved.
 *
 * Progressive enhancement is the whole design:
 *   - No support for scroll-driven animations (older Safari/Firefox)? The
 *     `@supports` guard never applies and the content is simply *there* -
 *     the same guarantee shape 2 made for no-JS visitors.
 *   - `prefers-reduced-motion`? Same: no animation, content visible.
 *   - No JavaScript at all? Still visible. This is now a **server
 *     component**, so most sections that use it ship zero client JS.
 *
 * `delay` is a stagger *step*, not seconds: siblings offset where in the
 * element's entry their reveal begins. See `.rise` in globals.css.
 */
export function Rise({
  children,
  delay = 0,
  className,
  as: Tag = "div",
  ...rest
}: {
  children: React.ReactNode;
  /** Stagger step for siblings (0, 1, 2 …). Legacy callers pass seconds;
   *  anything under 1 is scaled up so both spellings stagger sensibly. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "header" | "ul" | "li" | "article";
} & React.HTMLAttributes<HTMLElement>) {
  const step = delay > 0 && delay < 1 ? Math.round(delay * 20) : delay;
  return (
    <Tag
      className={cn("rise", className)}
      style={step ? ({ "--rise-step": step } as React.CSSProperties) : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
