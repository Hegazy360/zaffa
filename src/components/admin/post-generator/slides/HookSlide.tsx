import { Slide, OVERLAY_TEXT_SHADOW, OVERLAY_SUBTEXT_SHADOW } from "./Slide";
import { InspirationCollage } from "@/components/design-system/InspirationCollage";
import { RenderFrame } from "@/components/design-system/RenderFrame";
import { cn } from "@/lib/utils";

/**
 * The scroll-stopper. First slide of every carousel.
 *
 *  - default          full-bleed render + an editorial overlay headline
 *  - fourUp           2x2 of mini renders for `palette_test`
 *  - chaosToClarity   split before/after for `planner_pov`
 */
export type HookVariant = "default" | "fourUp" | "chaosToClarity";

export interface HookSlideProps {
  variant: HookVariant;
  /** Used by `default` and `chaosToClarity` ("after"). */
  renderUrl?: string;
  /** Used by `chaosToClarity` ("before"), falls back to first inspiration image. */
  beforeUrl?: string;
  /** 4 image URLs for the `fourUp` variant. */
  fourUpUrls?: string[];
  /** Lowercase overlay text. */
  headline: string;
  /** Optional sub-headline shown below the main one. */
  subline?: string;
}

export function HookSlide(props: HookSlideProps) {
  if (props.variant === "fourUp") return <FourUpHook {...props} />;
  if (props.variant === "chaosToClarity") return <ChaosToClarityHook {...props} />;
  return <DefaultHook {...props} />;
}

function BrandTag() {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-1.5 text-eyebrow font-semibold text-rose-700 ring-1 ring-rose-200/70 backdrop-blur-sm"
    >
      <span className="size-1.5 rounded-full bg-rose-500" />
      ZAFFA.AI
    </span>
  );
}

function DefaultHook({ renderUrl, headline, subline }: HookSlideProps) {
  return (
    <Slide>
      {renderUrl ? (
        <RenderFrame src={renderUrl} className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-rose-100 via-amber-50 to-stone-100" />
      )}
      {/* top brand tag */}
      <div className="absolute inset-x-0 top-0 px-16 pt-16">
        <BrandTag />
      </div>
      {/* bottom scrim + headline */}
      <div className="absolute inset-x-0 bottom-0 px-16 pb-20 pt-40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent"
        />
        <div className="relative">
          {/* small italic eyebrow above the title, adds editorial rhythm */}
          <p
            className="mb-4 font-display text-[18px] font-light italic leading-none tracking-[0.04em] text-rose-200/90"
            style={OVERLAY_SUBTEXT_SHADOW}
          >
            an editorial brief by zaffa
          </p>
          <h1
            className="text-balance font-display text-[72px] font-medium leading-[1.02] tracking-[-0.01em] text-white"
            style={OVERLAY_TEXT_SHADOW}
          >
            {headline}
          </h1>
          {subline && (
            <p
              className="mt-5 text-balance font-display text-[26px] font-light italic leading-snug tracking-[0.01em] text-white/95"
              style={OVERLAY_SUBTEXT_SHADOW}
            >
              {subline}
            </p>
          )}
        </div>
      </div>
    </Slide>
  );
}

function FourUpHook({ fourUpUrls = [], headline, subline }: HookSlideProps) {
  const slots = fourUpUrls.slice(0, 4);
  while (slots.length < 4) slots.push(slots[0] ?? "");
  return (
    <Slide className="bg-gradient-to-br from-[#F5EFE6] via-[#F1E9DD] to-[#E8DFD2]">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-16 pt-14">
        <span className="rounded-full bg-white/85 px-3.5 py-1.5 text-eyebrow font-semibold text-rose-700 ring-1 ring-rose-200/70">
          ONE PALETTE
        </span>
        <span className="rounded-full bg-stone-900/90 px-3.5 py-1.5 text-eyebrow font-semibold text-white">
          FOUR WAYS
        </span>
      </div>
      <div className="absolute inset-x-0 top-40 bottom-72 grid grid-cols-2 gap-5 px-12">
        {slots.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="relative overflow-hidden rounded-2xl shadow-xl ring-1 ring-stone-900/10"
          >
            {url ? (
              <RenderFrame src={url} className="absolute inset-0" />
            ) : (
              <div className="h-full w-full bg-stone-200" />
            )}
            <span className="absolute left-3 top-3 grid size-7 place-items-center rounded-full bg-white/95 text-xs font-semibold text-stone-900 shadow-md">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-12 px-16 text-center">
        <h1 className="text-balance font-display text-[56px] font-medium leading-tight tracking-[-0.01em] text-stone-900">
          {headline}
        </h1>
        {subline && (
          <p className="mt-3 font-display text-xl italic tracking-wide text-stone-700">
            {subline}
          </p>
        )}
      </div>
    </Slide>
  );
}

function ChaosToClarityHook({
  beforeUrl,
  renderUrl,
  headline,
  subline,
}: HookSlideProps) {
  return (
    <Slide>
      <div className="absolute inset-0 grid grid-cols-2">
        <div className={cn("relative overflow-hidden")}>
          {beforeUrl ? (
            <InspirationCollage
              images={[{ url: beforeUrl }]}
              variant="single"
            />
          ) : (
            <div className="h-full w-full bg-stone-200" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/30" />
          <span
            className="pointer-events-none absolute left-8 top-8 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-eyebrow text-stone-900 shadow-md ring-1 ring-stone-200"
          >
            BEFORE
          </span>
        </div>
        <div className="relative overflow-hidden">
          {renderUrl ? (
            <RenderFrame src={renderUrl} className="absolute inset-0" />
          ) : (
            <div className="h-full w-full bg-stone-100" />
          )}
          <span
            className="pointer-events-none absolute right-8 top-8 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-eyebrow text-white shadow-md"
          >
            AFTER
          </span>
        </div>
      </div>
      {/* divider line */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/70 shadow"
      />
      <div className="absolute inset-x-0 bottom-0 px-16 pb-16 pt-44">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent"
        />
        <div className="relative">
          <p
            className="mb-3 font-display text-[18px] font-light italic leading-none tracking-[0.04em] text-rose-200/90"
            style={OVERLAY_SUBTEXT_SHADOW}
          >
            a planner&apos;s pov
          </p>
          <h1
            className="text-balance font-display text-[62px] font-medium leading-[1.02] tracking-[-0.01em] text-white"
            style={OVERLAY_TEXT_SHADOW}
          >
            {headline}
          </h1>
          {subline && (
            <p
              className="mt-4 font-display text-[24px] font-light italic tracking-wide text-white/95"
              style={OVERLAY_SUBTEXT_SHADOW}
            >
              {subline}
            </p>
          )}
        </div>
      </div>
    </Slide>
  );
}
