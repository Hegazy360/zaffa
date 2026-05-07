import { cn } from "@/lib/utils";

/**
 * Full-bleed render surface with optional caption and framing variants.
 *
 * Used by:
 *  - The post-generator `FinalRenderSlide`.
 *  - (Future) the user-facing `GenerateRenderPanel` once we standardize
 *    on a 4:5 aspect for in-app render previews.
 */
export type RenderFraming =
  /** Full image, no zoom. */
  | "default"
  /** Cropped to a tighter detail — `object-cover` with `scale-110`. */
  | "detail"
  /** Pulled back with breathing room above and below. Useful for the
   *  "wide" variant in the `real_bride` format. */
  | "wide";

interface RenderFrameProps {
  src: string;
  alt?: string;
  framing?: RenderFraming;
  caption?: string | null;
  /**
   * When true, render at the locked carousel aspect (4:5). When false
   * (the default), the frame fills its parent and lets the parent set
   * dimensions — useful for non-slide previews.
   */
  lockAspect?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const FRAMING_CLASS: Record<RenderFraming, string> = {
  default: "object-cover",
  detail: "object-cover scale-110 origin-center",
  wide: "object-cover scale-[0.92]",
};

export function RenderFrame({
  src,
  alt,
  framing = "default",
  caption,
  lockAspect = false,
  className,
  children,
}: RenderFrameProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-stone-100",
        lockAspect && "aspect-[4/5]",
        !lockAspect && "h-full w-full",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        className={cn(
          "h-full w-full transition-transform duration-700",
          FRAMING_CLASS[framing],
        )}
      />
      {caption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-6">
          <p className="text-balance font-display text-base lowercase tracking-wide text-white">
            {caption}
          </p>
        </div>
      )}
      {children}
    </div>
  );
}
