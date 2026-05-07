import { Slide } from "./Slide";
import { RenderFrame } from "@/components/design-system/RenderFrame";
import { PaletteSwatchRow } from "@/components/design-system/PaletteSwatchRow";
import type { NamedPalette } from "@/types/posts";

export interface FinalRenderSlideProps {
  renderUrl: string;
  /** When set, overlays a small palette strip on the bottom of the slide. */
  paletteOverlay?: NamedPalette;
  /**
   * Three-word lowercase caption — used by `three_words` format. Each
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
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-16">
          <div className="space-y-1">
            {threeWordCaption.split(/\s+/).slice(0, 3).map((word, i) => (
              <p
                key={`${word}-${i}`}
                className="font-display text-[72px] font-light lowercase leading-[0.95] tracking-tight text-white"
              >
                {word}
              </p>
            ))}
          </div>
        </div>
      )}

      {!threeWordCaption && caption && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent p-12">
          <p className="text-balance font-display text-2xl lowercase tracking-wide text-white">
            {caption}
          </p>
        </div>
      )}

      {paletteOverlay && (
        <div className="absolute inset-x-12 bottom-12 rounded-2xl bg-white/85 p-5 shadow-lg backdrop-blur-sm">
          <p className="mb-3 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/85">
            {paletteOverlay.name}
          </p>
          <PaletteSwatchRow
            palette={paletteOverlay}
            layout="named"
            scale="md"
            showHex={false}
          />
        </div>
      )}
    </Slide>
  );
}
