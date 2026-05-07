"use client";

import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  RotateCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SLIDE_DIMENSIONS } from "@/types/posts";
import type { SlideRecord } from "@/types/posts";
import { RenderSlideRecord } from "@/components/admin/post-generator/slides/registry";

interface IGCarouselPreviewProps {
  slides: SlideRecord[];
  /** Per-slide regenerate handler. */
  onRegenerateSlide?: (slideIndex: number) => void;
  /** Slide indices currently being regenerated (show spinner). */
  regeneratingIndices?: Set<number>;
}

const PREVIEW_WIDTH = 480; // displayed width in px; scale derived from this

/**
 * Live React preview of the carousel, wrapped in faux Instagram chrome.
 *
 * Each slide is rendered at native 1080x1350 inside a child container,
 * then visually scaled down via CSS transform so it fits the preview
 * width. The unscaled DOM is what gets snapshotted by the rasterizer
 * (it mounts a separate hidden full-size copy).
 */
export function IGCarouselPreview({
  slides,
  onRegenerateSlide,
  regeneratingIndices,
}: IGCarouselPreviewProps) {
  const [rawIndex, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const scale = PREVIEW_WIDTH / SLIDE_DIMENSIONS.width;
  const displayHeight = SLIDE_DIMENSIONS.height * scale;

  // Clamp during render rather than via a setState-in-effect (which
  // double-renders and trips react-hooks/set-state-in-effect).
  const index = Math.min(rawIndex, Math.max(0, slides.length - 1));

  if (slides.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-rose-200/70 bg-white/40 p-12 text-center text-sm text-muted-foreground">
        No slides yet.
      </div>
    );
  }

  return (
    <div className="mx-auto" style={{ width: PREVIEW_WIDTH }}>
      {/* IG-post chrome: header */}
      <div className="flex items-center gap-3 rounded-t-2xl border border-stone-200 bg-white px-3 py-2">
        <div className="size-8 rounded-full bg-gradient-to-br from-rose-400 via-amber-300 to-orange-300 ring-2 ring-white">
          <div className="grid h-full w-full place-items-center">
            <span className="text-[10px] font-semibold text-white">Z</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">zaffa.ai</p>
          <p className="text-[10px] text-stone-500">sponsored</p>
        </div>
        <MoreHorizontal className="size-5 text-stone-700" />
      </div>

      {/* Carousel viewport */}
      <div
        className="relative overflow-hidden border-x border-stone-200 bg-stone-50"
        style={{ height: displayHeight }}
      >
        <div
          ref={trackRef}
          className="absolute inset-0 flex transition-transform duration-300 ease-out"
          style={{
            width: SLIDE_DIMENSIONS.width * scale * slides.length,
            transform: `translateX(${-index * PREVIEW_WIDTH}px)`,
          }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className="shrink-0"
              style={{
                width: PREVIEW_WIDTH,
                height: displayHeight,
              }}
            >
              <div
                style={{
                  width: SLIDE_DIMENSIONS.width,
                  height: SLIDE_DIMENSIONS.height,
                  transform: `scale(${scale})`,
                  transformOrigin: "0 0",
                }}
              >
                <RenderSlideRecord record={slide} />
              </div>
            </div>
          ))}
        </div>

        {/* nav arrows */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-md ring-1 ring-stone-200 disabled:opacity-0 disabled:pointer-events-none"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
              disabled={index === slides.length - 1}
              aria-label="Next slide"
              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-md ring-1 ring-stone-200 disabled:opacity-0 disabled:pointer-events-none"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}

        {/* per-slide regenerate */}
        {onRegenerateSlide && (
          <button
            type="button"
            onClick={() => onRegenerateSlide(index)}
            disabled={regeneratingIndices?.has(index)}
            aria-label="Regenerate this slide"
            className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white backdrop-blur-sm hover:bg-black/75 disabled:opacity-60"
          >
            {regeneratingIndices?.has(index) ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RotateCw className="size-3" />
            )}
            regenerate
          </button>
        )}

        {/* rasterized indicator */}
        {slides[index]?.rendered_png_url && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white backdrop-blur-sm">
            rendered
          </span>
        )}
      </div>

      {/* dots */}
      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 border-x border-stone-200 bg-white py-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === index ? "bg-sky-500" : "bg-stone-300",
              )}
            />
          ))}
        </div>
      )}

      {/* footer (mock IG actions) */}
      <div className="rounded-b-2xl border border-t-0 border-stone-200 bg-white px-3 pb-3 pt-2">
        <div className="flex items-center gap-3">
          <Heart className="size-6 text-stone-700" />
          <MessageCircle className="size-6 text-stone-700" />
          <Send className="size-6 text-stone-700" />
          <Bookmark className="ms-auto size-6 text-stone-700" />
        </div>
        <p className="mt-2 text-[11px] text-stone-500">
          slide {index + 1} of {slides.length}
        </p>
      </div>
    </div>
  );
}
