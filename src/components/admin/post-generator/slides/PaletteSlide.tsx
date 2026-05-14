import { Slide } from "./Slide";
import { PaletteSwatchRow } from "@/components/design-system/PaletteSwatchRow";
import type { NamedPalette } from "@/types/posts";

export interface PaletteSlideProps {
  palette: NamedPalette;
  vibe: string;
}

export function PaletteSlide({ palette, vibe }: PaletteSlideProps) {
  return (
    <Slide className="bg-gradient-to-br from-[#FAF6EE] via-stone-50 to-[#F1E9DD]">
      {/* Soft cream wash so swatches read warm regardless of palette. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 10%, rgba(255,255,255,0.6), transparent 60%)",
        }}
      />
      <div className="absolute inset-0 flex flex-col px-16 py-20">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.4em] text-rose-700">
            THE PALETTE
          </p>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.32em] text-stone-500">
            ZAFFA.AI
          </p>
        </div>

        <div className="mt-6">
          <h2 className="font-display text-[64px] font-medium leading-[1.02] tracking-[-0.01em] text-stone-900">
            {palette.name}
          </h2>
          <p className="mt-3 font-display text-[24px] font-light italic tracking-wide text-stone-700">
            for {vibe}
          </p>
          <div className="mt-6 h-px w-24 bg-rose-700/40" />
        </div>

        {/* preview stripes — gives a quick "how the palette flows" read */}
        <div className="mt-12">
          <PaletteSwatchRow
            palette={palette}
            layout="stripes"
            scale="xl"
          />
        </div>

        <div className="mt-auto">
          <PaletteSwatchRow
            palette={palette}
            layout="named"
            scale="xl"
            showHex
          />
        </div>
      </div>
    </Slide>
  );
}
