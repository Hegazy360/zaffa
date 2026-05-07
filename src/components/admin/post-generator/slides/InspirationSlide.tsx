import { Slide } from "./Slide";
import { InspirationCollage } from "@/components/design-system/InspirationCollage";

export interface InspirationSlideProps {
  imageUrls: string[];
  vibe: string;
}

export function InspirationSlide({ imageUrls, vibe }: InspirationSlideProps) {
  return (
    <Slide className="bg-[#F5EFE6]">
      <div className="absolute inset-x-0 top-0 z-10 px-16 pt-14">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.4em] text-rose-700/85">
          inspiration
        </p>
        <h2 className="mt-3 font-display text-[44px] font-light lowercase leading-tight tracking-tight">
          {vibe}
        </h2>
      </div>
      <InspirationCollage
        images={imageUrls.map((url) => ({ url }))}
        variant="moodboard"
        className="pt-44"
      />
    </Slide>
  );
}
