"use client";

import Image from "next/image";
import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronsLeftRight } from "lucide-react";
import { MediaImage } from "@/components/ui/media-image";
import { IMAGE_SIZES, type ImageSizePreset } from "@/lib/cloudinary-loader";
import { cn } from "@/lib/utils";

/**
 * Before/after compare: the couple's venue photo and the render that
 * dressed it, stacked in one frame, with a divider they drag (or step with
 * the keyboard) to wipe between the two.
 *
 * Direction. "Before" sits on the inline-start side of the divider and
 * "after" on the inline-end side, so the frame reads before-then-after in
 * the reader's own direction: before on the left in English, on the right
 * in Arabic. The value is the divider's distance from inline-start, which
 * is how much of "before" shows, so moving the divider toward inline-end
 * reveals more "before" in both directions. The clip is CSS (`rtl:`), not
 * a direction read in JavaScript, so the server HTML is already right and
 * nothing flips on hydration.
 *
 * Input. Pointer events cover mouse, touch and pen. The frame is
 * `touch-action: pan-y`, so a vertical swipe still scrolls the page on a
 * phone and only a sideways drag moves the divider; a touch that never
 * moves is a tap and jumps the divider there. The divider itself is a
 * `role="slider"` with arrow keys (5%), Page Up/Down (10%), Home and End.
 * Left and Right follow the screen, whatever the reading direction.
 *
 * Motion. There is none to reduce: no intro sweep, no easing. The divider
 * is exactly where the pointer or the last key put it.
 *
 * Images. Both are cover-fitted into a frame of the given intrinsic
 * aspect, so a render whose model rounded the photo's proportions still
 * lines up. Cloudinary renders go through `MediaImage` (loader, signed-URL
 * safety); local assets through `next/image`. Lazy unless `priority`.
 */

export interface CompareImage {
  src: string;
  alt: string;
}

export interface CompareSliderProps {
  before: CompareImage;
  after: CompareImage;
  /** Intrinsic size of the frame; sets its aspect ratio. */
  width: number;
  height: number;
  sizes: ImageSizePreset;
  beforeLabel: string;
  afterLabel: string;
  /** Accessible name of the divider. */
  label: string;
  /** Start position, percent of the frame showing "before". Default 50. */
  initial?: number;
  /** Above the fold: load both images eagerly. */
  priority?: boolean;
  className?: string;
  /** Drawn over the frame, above both images (a watermark badge, say). */
  children?: ReactNode;
}

const STEP = 5;
const PAGE_STEP = 10;

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function isRtl(el: HTMLElement | null): boolean {
  return !!el && getComputedStyle(el).direction === "rtl";
}

function SlideImage({
  image,
  sizes,
  priority,
}: {
  image: CompareImage;
  sizes: ImageSizePreset;
  priority?: boolean;
}) {
  // Local assets (the homepage examples) have no Cloudinary loader to go
  // through; everything else is a render or an upload on our cloud.
  if (image.src.startsWith("/")) {
    return (
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={IMAGE_SIZES[sizes]}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className="object-cover"
      />
    );
  }
  return (
    <MediaImage
      src={image.src}
      alt={image.alt}
      fill
      sizes={sizes}
      priority={priority}
    />
  );
}

export function CompareSlider({
  before,
  after,
  width,
  height,
  sizes,
  beforeLabel,
  afterLabel,
  label,
  initial = 50,
  priority,
  className,
  children,
}: CompareSliderProps) {
  const [pos, setPos] = useState(() => clamp(initial));
  const frameRef = useRef<HTMLDivElement>(null);
  // The pointer currently dragging, and for touch, where it went down: a
  // touch only moves the divider once it moves, so scrolling past the
  // frame never yanks it.
  const drag = useRef<{ id: number; touch: boolean; moved: boolean } | null>(
    null,
  );

  const posFromClientX = useCallback((clientX: number): number | null => {
    const el = frameRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const fromStart = isRtl(el) ? rect.right - clientX : clientX - rect.left;
    return clamp((fromStart / rect.width) * 100);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const touch = e.pointerType === "touch";
    drag.current = { id: e.pointerId, touch, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!touch) {
      const next = posFromClientX(e.clientX);
      if (next != null) setPos(next);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.moved = true;
    const next = posFromClientX(e.clientX);
    if (next != null) setPos(next);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>, commitTap: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // A touch that never moved is a tap: jump the divider to it.
    if (commitTap && d.touch && !d.moved) {
      const next = posFromClientX(e.clientX);
      if (next != null) setPos(next);
    }
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Left and Right move the divider the way the arrow points on screen,
    // which is toward or away from inline-start depending on direction.
    const towardStart = isRtl(frameRef.current) ? "ArrowRight" : "ArrowLeft";
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight":
        next = pos + (e.key === towardStart ? -STEP : STEP);
        break;
      case "ArrowUp":
        next = pos + STEP;
        break;
      case "ArrowDown":
        next = pos - STEP;
        break;
      case "PageUp":
        next = pos + PAGE_STEP;
        break;
      case "PageDown":
        next = pos - PAGE_STEP;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 100;
        break;
    }
    if (next == null) return;
    e.preventDefault();
    setPos(clamp(next));
  };

  const rounded = Math.round(pos);

  return (
    <div
      ref={frameRef}
      data-compare-slider=""
      className={cn(
        "relative w-full touch-pan-y select-none overflow-hidden bg-muted",
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
    >
      <div className="pointer-events-none absolute inset-0">
        <SlideImage image={before} sizes={sizes} priority={priority} />
      </div>
      {/* "After" covers the frame and is clipped away on the inline-start
          side up to the divider, leaving "before" showing there. */}
      <div
        className="pointer-events-none absolute inset-0 [clip-path:inset(0_0_0_var(--compare-pos))] rtl:[clip-path:inset(0_var(--compare-pos)_0_0)]"
        style={{ ["--compare-pos" as string]: `${pos}%` }}
      >
        <SlideImage image={after} sizes={sizes} priority={priority} />
      </div>

      <span className="pointer-events-none absolute start-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute end-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
        {afterLabel}
      </span>

      {/* Zero-width track at the divider: its children centre on the
          divider in either direction without a direction-specific
          translate. */}
      <div
        className="absolute inset-y-0 flex w-0 justify-center"
        style={{ insetInlineStart: `${pos}%` }}
      >
        <div className="pointer-events-none h-full w-0.5 shrink-0 bg-white/90 shadow-[0_0_6px_rgba(0,0,0,0.45)]" />
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rounded}
          aria-valuetext={`${rounded}%`}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-white text-foreground shadow-lg ring-1 ring-black/10 outline-none focus-visible:ring-4 focus-visible:ring-rose-400/70"
        >
          <ChevronsLeftRight className="size-5" aria-hidden />
        </div>
      </div>

      {children}
    </div>
  );
}
