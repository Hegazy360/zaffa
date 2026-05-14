import { Slide } from "./Slide";

export interface CTASlideProps {
  /** Top-line invitation copy. */
  headline?: string;
  /** Sub-line, often the URL or a one-line elaboration. */
  subline?: string;
}

/**
 * Closing slide for the `three_words` format (and anywhere else the
 * carousel needs a clean handoff). Minimal editorial invitation copy +
 * the zaffa.ai mark.
 */
export function CTASlide({
  headline = "Your Lookbook,\nThree Weeks Out.",
  subline = "zaffa.ai",
}: CTASlideProps) {
  return (
    <Slide className="bg-gradient-to-br from-[#FFF1F0] via-[#FAF6EE] to-[#F3E9D7]">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 30%, rgba(244, 194, 200, 0.45), transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 25% 80%, rgba(225, 195, 145, 0.35), transparent 60%)",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-20 text-center">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.4em] text-rose-700">
          START WITH A VIBE
        </p>
        <div className="mt-6 h-px w-16 bg-rose-700/40" />
        <h1 className="mt-10 whitespace-pre-line font-display text-[88px] font-medium leading-[0.98] tracking-[-0.015em] text-stone-900">
          {headline}
        </h1>
        <p className="mt-12 font-display text-[28px] font-light italic tracking-wide text-stone-700">
          We design weddings around a feeling — not a checklist.
        </p>
        <p className="mt-10 font-display text-3xl font-medium tracking-[0.02em] text-rose-700">
          {subline}
        </p>
        <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.4em] text-stone-500">
          DESIGNED WITH ZAFFA
        </p>
      </div>
    </Slide>
  );
}
