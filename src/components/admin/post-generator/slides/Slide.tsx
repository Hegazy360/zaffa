import { cn } from "@/lib/utils";
import { SLIDE_DIMENSIONS } from "@/types/posts";

/**
 * Locked-dimension wrapper for every slide component. The carousel
 * preview (in admin/posts/[id]) and the rasterizer both target the
 * `[data-slide-root]` selector to scale or screenshot the slide.
 *
 * Slides always render at their native 1080x1350. The preview shrinks
 * them with a CSS transform; the rasterizer copies the unscaled DOM
 * into a hidden 1080x1350 container and uses html-to-image.
 */
interface SlideProps {
  children: React.ReactNode;
  className?: string;
}

export function Slide({ children, className }: SlideProps) {
  return (
    <div
      data-slide-root
      className={cn(
        "relative isolate overflow-hidden bg-stone-50 text-stone-900",
        className,
      )}
      style={{
        width: `${SLIDE_DIMENSIONS.width}px`,
        height: `${SLIDE_DIMENSIONS.height}px`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Style block applied to white-on-image headlines so they stay readable
 * regardless of what the underlying render looks like. Used by every
 * slide that overlays text on a photograph.
 */
export const OVERLAY_TEXT_SHADOW = {
  textShadow:
    "0 2px 8px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)",
} as const;

/**
 * Slightly lighter shadow used for sublines and small caps labels —
 * preserves crispness without making the type feel chunky.
 */
export const OVERLAY_SUBTEXT_SHADOW = {
  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
} as const;
