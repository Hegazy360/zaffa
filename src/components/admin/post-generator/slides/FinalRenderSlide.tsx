import { Slide, OVERLAY_TEXT_SHADOW, OVERLAY_SUBTEXT_SHADOW } from "./Slide";
import { RenderFrame } from "@/components/design-system/RenderFrame";
import { PaletteSwatchRow } from "@/components/design-system/PaletteSwatchRow";
import type { NamedPalette } from "@/types/posts";

export interface FinalRenderSlideProps {
  renderUrl: string;
  /** When set, overlays a small palette strip on the bottom of the slide. */
  paletteOverlay?: NamedPalette;
  /**
   * Three-word lowercase caption, used by `three_words` format. Each
   * word renders on its own line over the bottom gradient.
   */
  threeWordCaption?: string;
  framing?: "default" | "detail" | "wide";
  caption?: string;
}

export function FinalRenderSlide({
  renderUrl,
  paletteOverlay,
  threeWordCaption,
  framing = "default",
  caption,
}: FinalRenderSlideProps) {
  return (
    <Slide>
      <RenderFrame
        src={renderUrl}
        framing={framing}
        className="absolute inset-0"
      />

      {threeWordCaption && (
        <div className="absolute inset-x-0 bottom-0 px-16 pb-20 pt-44">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
          />
          <div className="relative space-y-2">
            {threeWordCaption
              .split(/\s+/)
              .slice(0, 3)
              .map((word, i) => (
                <p
                  key={`${word}-${i}`}
                  className="font-display text-[84px] font-medium leading-[0.95] tracking-[-0.015em] text-white"
                  style={OVERLAY_TEXT_SHADOW}
                >
                  {word}
                </p>
              ))}
          </div>
        </div>
      )}

      {!threeWordCaption && caption && (
        <div className="absolute inset-x-0 bottom-0 px-12 pb-12 pt-32">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent"
          />
          <p
            className="relative text-balance font-display text-[30px] font-normal italic leading-snug tracking-wide text-white"
            style={OVERLAY_SUBTEXT_SHADOW}
          >
            {caption}
          </p>
        </div>
      )}

      {paletteOverlay && (
        <div className="absolute inset-x-10 bottom-10 rounded-2xl bg-white/95 p-6 shadow-2xl ring-1 ring-stone-900/10 backdrop-blur-sm">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-[22px] font-medium tracking-[-0.005em] text-stone-900">
              {paletteOverlay.name}
            </p>
            <p className="text-eyebrow font-semibold text-rose-700">
              PALETTE
            </p>
          </div>
          <div className="mt-4">
            <PaletteSwatchRow
              palette={paletteOverlay}
              layout="stripes"
              scale="lg"
            />
          </div>
        </div>
      )}
    </Slide>
  );
}
