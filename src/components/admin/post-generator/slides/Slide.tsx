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
