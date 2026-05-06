import { fetchMarketplaceTeaser } from "@/lib/marketplace-teaser";
import { cn } from "@/lib/utils";
import { MarketplaceTeaser } from "./marketplace-teaser";

type Variant = "home" | "planner-signup";

interface MarketplaceTeaserSectionProps {
  variant: Variant;
  className?: string;
}

/**
 * Server-component wrapper that performs the DB read for the teaser. Kept
 * separate from the page so callers can wrap it in `<Suspense>` and stream
 * the rest of the marketing shell while the teaser query is in flight.
 *
 * On a remote DB the marketing-home shell now flushes in milliseconds even
 * though the teaser still costs a couple of hundred ms behind the scenes.
 */
export async function MarketplaceTeaserSection({
  variant,
  className,
}: MarketplaceTeaserSectionProps) {
  const data = await fetchMarketplaceTeaser();
  return <MarketplaceTeaser data={data} variant={variant} className={className} />;
}

/**
 * Skeleton sized to roughly match the rendered teaser so the layout doesn't
 * jump when the streamed content arrives. Two variants:
 *
 * - "home": full-bleed editorial section, 6-card grid, mirrors the marketing
 *   layout's vertical rhythm.
 * - "planner-signup": compact aside card, 3 cards in a row.
 */
export function MarketplaceTeaserSkeleton({
  variant,
  className,
}: MarketplaceTeaserSectionProps) {
  const isHome = variant === "home";
  const cards = isHome ? 6 : 3;

  if (isHome) {
    return (
      <section
        aria-hidden
        className={cn(
          "relative isolate overflow-hidden bg-gradient-to-b from-background via-rose-50/30 to-background",
          className,
        )}
      >
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:py-28">
          <div className="mb-8 max-w-2xl">
            <div className="mb-5 h-7 w-44 animate-pulse rounded-full bg-rose-100/70" />
            <div className="h-12 w-full max-w-xl animate-pulse rounded-md bg-muted" />
            <div className="mt-3 h-12 w-2/3 animate-pulse rounded-md bg-muted" />
            <div className="mt-5 h-5 w-5/6 animate-pulse rounded bg-muted/70" />
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: cards }).map((_, i) => (
              <li
                key={i}
                className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/70 dark:border-rose-900/40 dark:bg-card/70"
              >
                <div className="aspect-[4/3] w-full animate-pulse bg-gradient-to-br from-rose-100/60 to-amber-100/40" />
                <div className="space-y-2 p-4">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3.5 w-20 animate-pulse rounded bg-muted/70" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-hidden
      className={cn(
        "rounded-3xl border border-rose-200/60 bg-gradient-to-br from-rose-50/80 via-white/70 to-amber-50/60 p-5 shadow-sm backdrop-blur-md sm:p-6 dark:border-rose-900/40 dark:from-rose-950/30 dark:via-card/60 dark:to-amber-950/20",
        className,
      )}
    >
      <div className="mb-3 h-5 w-32 animate-pulse rounded-full bg-rose-100/70" />
      <div className="h-7 w-full max-w-xs animate-pulse rounded-md bg-muted" />
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted/70" />
      <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 dark:border-rose-900/40 dark:bg-card/70"
          >
            <div className="aspect-[5/4] w-full animate-pulse bg-gradient-to-br from-rose-100/60 to-amber-100/40" />
            <div className="space-y-2 p-4">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted/70" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
