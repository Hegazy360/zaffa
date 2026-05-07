import { Slide } from "./Slide";
import { PaletteSwatchRow } from "@/components/design-system/PaletteSwatchRow";
import type { CoupleNames, NamedPalette } from "@/types/posts";

export interface LookbookCoverSlideProps {
  renderUrl: string;
  palette: NamedPalette;
  coupleNames: CoupleNames;
  vibe: string;
}

/**
 * Mockup of a printed lookbook resting on a table. Built entirely from
 * CSS — no prop assets — so any post can use this slide without an
 * extra image-gen step. The render gets composited as the cover image
 * in the foreground.
 */
export function LookbookCoverSlide({
  renderUrl,
  palette,
  coupleNames,
  vibe,
}: LookbookCoverSlideProps) {
  return (
    <Slide className="bg-gradient-to-br from-[#E8DFD2] via-[#F1E9DD] to-[#D9CDB9]">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.4), transparent 60%)",
        }}
      />

      <div
        className="absolute left-1/2 top-1/2 h-[920px] w-[680px] -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] overflow-hidden rounded-md bg-white shadow-2xl ring-1 ring-foreground/10"
      >
        <div className="absolute inset-0 grid grid-rows-[1fr_auto]">
          <div className="relative overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={renderUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
          </div>
          <div className="bg-[#FAF6EE] px-10 py-8 text-stone-900">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.4em] text-rose-700/85">
              {vibe}
            </p>
            <h1 className="mt-3 font-display text-[56px] font-light lowercase leading-[0.95] tracking-tight">
              {coupleNames.partner_a}
              <span className="mx-3 align-middle text-3xl text-stone-400">&</span>
              {coupleNames.partner_b}
            </h1>
            <div className="mt-5">
              <PaletteSwatchRow
                palette={palette}
                layout="stripes"
                scale="lg"
              />
            </div>
            <p className="mt-5 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-stone-500">
              the lookbook · zaffa.ai
            </p>
          </div>
        </div>
      </div>

      {/* spine + page-edge shadow gives the book some depth */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[920px] w-[680px] -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] rounded-md ring-1 ring-stone-300/60"
        style={{
          boxShadow:
            "inset -8px 0 16px rgba(0,0,0,0.07), 0 40px 80px rgba(0,0,0,0.18)",
        }}
      />
    </Slide>
  );
}
