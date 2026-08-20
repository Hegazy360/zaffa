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
 * CSS, no prop assets, so any post can use this slide without an
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
      {/* warm directional wash */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 18%, rgba(255,255,255,0.55), transparent 60%)",
        }}
      />
      {/* paper grain, subtle */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] mix-blend-multiply"
        style={{
          backgroundImage:
            "radial-gradient(rgba(60,30,10,0.5) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />

      <div
        className="absolute left-1/2 top-1/2 h-[940px] w-[700px] -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] overflow-hidden rounded-md bg-white shadow-2xl ring-1 ring-stone-900/10"
      >
        <div className="absolute inset-0 grid grid-rows-[1fr_auto]">
          <div className="relative overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={renderUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/35" />
            <span className="absolute right-6 top-6 rounded-full bg-white/95 px-3 py-1 text-eyebrow font-semibold text-stone-900 shadow ring-1 ring-stone-200">
              THE LOOKBOOK
            </span>
          </div>
          <div className="bg-[#FAF6EE] px-12 py-10 text-stone-900">
            <p className="text-eyebrow font-semibold text-rose-700">
              {vibe.toUpperCase()}
            </p>
            <h1 className="mt-4 flex flex-wrap items-baseline gap-x-3 font-display text-[60px] font-medium leading-[1.02] tracking-[-0.01em]">
              <span>{coupleNames.partner_a}</span>
              <span className="font-display text-[48px] font-light italic text-rose-600">
                &amp;
              </span>
              <span>{coupleNames.partner_b}</span>
            </h1>
            <div className="mt-6">
              <PaletteSwatchRow
                palette={palette}
                layout="stripes"
                scale="lg"
              />
            </div>
            <p className="mt-6 text-eyebrow font-semibold text-muted-foreground">
              DESIGNED WITH ZAFFA.AI
            </p>
          </div>
        </div>
      </div>

      {/* spine + page-edge shadow gives the book some depth */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[940px] w-[700px] -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] rounded-md ring-1 ring-stone-300/60"
        style={{
          boxShadow:
            "inset -10px 0 18px rgba(0,0,0,0.08), 0 50px 90px rgba(0,0,0,0.22)",
        }}
      />
    </Slide>
  );
}
