import { Slide } from "./Slide";

export interface CTASlideProps {
  /** Top-line invitation copy. */
  headline?: string;
  /** Sub-line, often the URL or a one-line elaboration. */
  subline?: string;
}

/**
 * Closing slide for the `three_words` format (and anywhere else the
 * carousel needs a clean handoff). Minimal lowercase invitation copy +
 * the zaffa.ai mark.
 */
export function CTASlide({
  headline = "your lookbook,\nthree weeks out.",
  subline = "zaffa.ai",
}: CTASlideProps) {
  return (
    <Slide className="bg-gradient-to-br from-rose-50 via-amber-50/60 to-stone-50">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 30%, rgba(244, 194, 200, 0.4), transparent 65%)",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-20 text-center">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.4em] text-rose-700/85">
          start with a vibe
        </p>
        <h1 className="mt-8 whitespace-pre-line font-display text-[88px] font-light lowercase leading-[0.95] tracking-tight">
          {headline}
        </h1>
        <p className="mt-12 font-display text-3xl lowercase tracking-wide text-stone-700">
          {subline}
        </p>
      </div>
    </Slide>
  );
}
