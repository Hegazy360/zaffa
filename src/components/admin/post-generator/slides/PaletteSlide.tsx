import { Slide } from "./Slide";
import { PaletteSwatchRow } from "@/components/design-system/PaletteSwatchRow";
import type { NamedPalette } from "@/types/posts";

export interface PaletteSlideProps {
  palette: NamedPalette;
  vibe: string;
}

export function PaletteSlide({ palette, vibe }: PaletteSlideProps) {
  return (
    <Slide className="bg-stone-50">
      <div className="absolute inset-0 flex flex-col px-16 py-20">
        <div>
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.4em] text-rose-700/85">
            palette
          </p>
          <h2 className="mt-3 font-display text-[56px] font-light lowercase leading-tight tracking-tight">
            {palette.name}
          </h2>
          <p className="mt-2 text-2xl lowercase tracking-wide text-stone-600">
            {vibe}
          </p>
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
