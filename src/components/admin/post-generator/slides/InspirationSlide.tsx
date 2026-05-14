import { Slide } from "./Slide";
import { InspirationCollage } from "@/components/design-system/InspirationCollage";

export interface InspirationSlideProps {
  imageUrls: string[];
  vibe: string;
}

export function InspirationSlide({ imageUrls, vibe }: InspirationSlideProps) {
  return (
    <Slide className="bg-[#F5EFE6]">
      {/* paper-banner header — solid cream so the title is always
          readable even when the collage runs hot at the top. */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#FAF6EE] via-[#FAF6EE]/95 to-transparent px-16 pb-10 pt-16">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.4em] text-rose-700">
            INSPIRATION
          </p>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.32em] text-stone-500">
            ZAFFA.AI
          </p>
        </div>
        <h2 className="mt-4 font-display text-[56px] font-medium leading-[1.05] tracking-[-0.01em] text-stone-900">
          {vibe}
        </h2>
        <p className="mt-2 font-display text-[20px] font-light italic tracking-wide text-stone-600">
          A moodboard, before the brief.
        </p>
        <div className="mt-5 h-px w-24 bg-rose-700/40" />
      </div>
      <InspirationCollage
        images={imageUrls.map((url) => ({ url }))}
        variant="moodboard"
        className="pt-56"
      />
    </Slide>
  );
}
