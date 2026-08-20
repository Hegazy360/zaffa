"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Sparkles,
  Star,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { cn } from "@/lib/utils";

import { useFormatters } from "@/lib/use-formatters";
function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return Number(value.toString()) || 0;
  }
  return 0;
}

function specialtiesArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

// Renders a 5-star row with partial fill based on a fractional rating (0-5).
// Uses a two-layer trick: a stone-coloured base row and an overlay row of
// amber stars clipped via inline width so a 4.3 average shows ~86% fill.
function StarRow({
  value,
  size = 4,
  className,
}: {
  value: number;
  size?: 3 | 3.5 | 4 | 5 | 6;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const pct = (clamped / 5) * 100;
  const sizeClass: Record<typeof size, string> = {
    3: "size-3",
    3.5: "size-3.5",
    4: "size-4",
    5: "size-5",
    6: "size-6",
  };
  return (
    <div
      className={cn("relative inline-flex", className)}
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
    >
      <div className="flex gap-0.5 text-stone-200">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={cn(sizeClass[size], "fill-current")} />
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden text-amber-400"
        style={{ width: `${pct}%` }}
      >
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={cn(sizeClass[size], "fill-current")} />
          ))}
        </div>
      </div>
    </div>
  );
}

function styleTagsArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  return [];
}

export default function PublicPlannerProfilePage() {
  const params = useParams();
  const f = useFormatters();
  const id = params.id as string;
  const { data: planner, isLoading, error } = trpc.planner.byId.useQuery({
    id,
  });

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="mx-auto flex flex-1 max-w-3xl flex-col items-center justify-center px-6 py-24 text-center">
          <h2 className="font-display text-2xl font-light tracking-tight">
            Planner not found
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <Button
            variant="outline"
            render={<Link href="/planners" />}
            className="mt-6"
          >
            <ArrowLeft className="me-1.5 size-3.5" />
            Back to planners
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (isLoading || !planner) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-rose-500" />
        </div>
        <Footer />
      </div>
    );
  }

  const specialties = specialtiesArray(planner.specialties);
  const rating = decimalToNumber(planner.avg_rating);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="relative isolate flex-1 overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grain-bg opacity-30"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl"
        />

        <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
          <div className="mb-8">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/planners" />}
              className="-ms-2 gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          </div>

          {/* Hero */}
          <header className="mb-12 grid gap-8 md:grid-cols-12">
            <div className="md:col-span-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
                <Sparkles className="size-3" />
                Event planner
              </div>
              <h1 className="font-display mt-4 text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
                {planner.business_name}
              </h1>
              {planner.review_count > 0 && (
                <a
                  href="#reviews"
                  className="mt-5 inline-flex items-center gap-3 rounded-full border border-amber-200/70 bg-amber-50/70 px-3.5 py-1.5 backdrop-blur-sm transition-colors hover:bg-amber-50"
                >
                  <StarRow value={rating} size={4} />
                  <span className="font-display text-base font-medium tracking-tight text-amber-900">
                    {rating.toFixed(1)}
                  </span>
                  <span className="text-xs text-amber-800/80">
                    · {planner.review_count} review
                    {planner.review_count === 1 ? "" : "s"}
                  </span>
                </a>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span>{planner.profile.full_name}</span>
                {planner.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" />
                    {planner.location}
                  </span>
                )}
                {planner.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100">
                    <CheckCircle2 className="size-3" />
                    Verified
                  </span>
                )}
              </div>
              {planner.bio && (
                <p className="mt-6 max-w-2xl text-pretty text-sm text-foreground/85 sm:text-base">
                  {planner.bio}
                </p>
              )}
              {specialties.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {specialties.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-rose-50 px-2.5 py-1 text-xs text-rose-700 ring-1 ring-rose-100"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="md:col-span-4">
              <div className="overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
                <div className="relative aspect-[4/3] bg-gradient-to-br from-rose-100 to-amber-100">
                  {planner.profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={planner.profile.avatar_url}
                      alt={planner.profile.full_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <span className="font-display text-6xl font-light text-rose-700/70">
                        {planner.business_name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Portfolio */}
          <section className="mb-14">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
                  Portfolio
                </p>
                <h2 className="font-display text-2xl font-light tracking-tight">
                  Past work
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                {planner.portfolio_items.length}{" "}
                {planner.portfolio_items.length === 1 ? "piece" : "pieces"}
              </p>
            </div>

            {planner.portfolio_items.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-16 text-center backdrop-blur-sm">
                <div className="mb-4 grid size-12 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
                  <ImageIcon className="size-5 text-rose-600" />
                </div>
                <p className="font-display text-lg font-light tracking-tight">
                  No portfolio yet
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  This planner hasn&apos;t shared any past work publicly.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {planner.portfolio_items.map((item) => {
                  const tags = styleTagsArray(item.style_tags);
                  return (
                    <article
                      key={item.id}
                      className="group overflow-hidden rounded-2xl border border-brand-line bg-white/80 ring-1 ring-foreground/[0.04] backdrop-blur-sm"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image_url}
                          alt={item.caption ?? ""}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      </div>
                      <div className="space-y-2 p-4">
                        {item.caption && (
                          <p className="text-sm font-medium leading-tight">
                            {item.caption}
                          </p>
                        )}
                        {item.event_type && (
                          <p className="text-eyebrow text-muted-foreground">
                            {item.event_type}
                          </p>
                        )}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {tags.map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-100"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div aria-hidden className="champagne-hairline mb-14 h-px w-full" />

          {/* Reviews */}
          <section id="reviews" className="scroll-mt-20">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
                  Reviews
                </p>
                <h2 className="font-display text-2xl font-light tracking-tight">
                  What couples say
                </h2>
              </div>
              {planner.review_count > 0 && (
                <div className="flex items-center gap-3 rounded-2xl border border-amber-100/70 bg-amber-50/40 px-4 py-2.5">
                  <StarRow value={rating} size={5} />
                  <div>
                    <p className="font-display text-xl font-medium leading-none tracking-tight text-amber-900">
                      {rating.toFixed(1)}
                      <span className="ms-1 text-sm font-light text-amber-700/70">
                        / 5
                      </span>
                    </p>
                    <p className="text-xs text-amber-800/80">
                      Based on {planner.review_count} review
                      {planner.review_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {planner.reviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-12 text-center">
                <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
                  <Star className="size-4 text-rose-600" />
                </div>
                <p className="font-display text-base font-light tracking-tight">
                  No reviews yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Be the first to share your experience after your event.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {planner.reviews.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-2xl border border-brand-line bg-white/80 p-5 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      {r.author.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.author.avatar_url}
                          alt={r.author.full_name}
                          className="size-9 rounded-full object-cover ring-1 ring-rose-200"
                        />
                      ) : (
                        <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-xs font-semibold text-rose-800">
                          {r.author.full_name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {r.author.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {f.date(r.created_at, "long")}
                        </p>
                      </div>
                      <StarRow value={r.rating} size={3.5} />
                    </div>
                    {r.comment && (
                      <p className="mt-3 italic text-sm text-foreground/90">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
