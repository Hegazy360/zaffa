import { Slide } from "./Slide";
import { InspirationCollage } from "@/components/design-system/InspirationCollage";
import { RenderFrame } from "@/components/design-system/RenderFrame";
import { cn } from "@/lib/utils";

/**
 * The scroll-stopper. First slide of every carousel.
 *
 *  - default          full-bleed render + a lowercase overlay headline
 *  - fourUp           2x2 of mini renders for `palette_test`
 *  - chaosToClarity   split before/after for `planner_pov`
 */
export type HookVariant = "default" | "fourUp" | "chaosToClarity";

export interface HookSlideProps {
  variant: HookVariant;
  /** Used by `default` and `chaosToClarity` ("after"). */
  renderUrl?: string;
  /** Used by `chaosToClarity` ("before") — falls back to first inspiration image. */
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

function DefaultHook({ renderUrl, headline, subline }: HookSlideProps) {
  return (
    <Slide>
      {renderUrl ? (
        <RenderFrame src={renderUrl} className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-rose-100 via-amber-50 to-stone-100" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-16">
        <h1 className="text-balance font-display text-[64px] font-light leading-[1.05] lowercase tracking-tight text-white">
          {headline}
        </h1>
        {subline && (
          <p className="mt-4 text-balance text-2xl lowercase tracking-wide text-white/85">
            {subline}
          </p>
        )}
      </div>
    </Slide>
  );
}

function FourUpHook({ fourUpUrls = [], headline, subline }: HookSlideProps) {
  const slots = fourUpUrls.slice(0, 4);
  while (slots.length < 4) slots.push(slots[0] ?? "");
  return (
    <Slide className="bg-stone-100">
      <div className="absolute inset-0 grid grid-cols-2 gap-4 p-12">
        {slots.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="relative overflow-hidden rounded-2xl shadow-md ring-1 ring-foreground/10"
          >
            {url ? (
              <RenderFrame src={url} className="absolute inset-0" />
            ) : (
              <div className="h-full w-full bg-stone-200" />
            )}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-12 px-16 text-center">
        <h1 className="text-balance font-display text-[52px] font-light lowercase leading-tight tracking-tight">
          {headline}
        </h1>
        {subline && (
          <p className="mt-3 text-xl lowercase tracking-wide text-stone-600">
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
          <span className="pointer-events-none absolute left-8 top-8 rounded-full bg-white/85 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em]">
            before
          </span>
        </div>
        <div className="relative overflow-hidden">
          {renderUrl ? (
            <RenderFrame src={renderUrl} className="absolute inset-0" />
          ) : (
            <div className="h-full w-full bg-stone-100" />
          )}
          <span className="pointer-events-none absolute right-8 top-8 rounded-full bg-rose-600/90 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-white">
            after
          </span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-16">
        <h1 className="text-balance font-display text-[60px] font-light lowercase leading-[1.05] tracking-tight text-white">
          {headline}
        </h1>
        {subline && (
          <p className="mt-4 text-2xl lowercase tracking-wide text-white/85">
            {subline}
          </p>
        )}
      </div>
    </Slide>
  );
}
