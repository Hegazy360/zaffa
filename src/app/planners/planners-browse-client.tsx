"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, MapPin, Search, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function specialtiesArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return Number(value.toString()) || 0;
  }
  return 0;
}

interface FilterState {
  query: string;
  location: string;
  verifiedOnly: boolean;
}

const PAGE_SIZE = 24;

export function PlannersBrowseClient() {
  const t = useTranslations("browse");
  const [draft, setDraft] = useState<FilterState>({
    query: "",
    location: "",
    verifiedOnly: false,
  });
  const [filters, setFilters] = useState<FilterState>(draft);

  const list = trpc.planner.list.useInfiniteQuery(
    {
      query: filters.query || undefined,
      location: filters.location || undefined,
      verifiedOnly: filters.verifiedOnly || undefined,
      take: PAGE_SIZE,
    },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );

  const items = (list.data?.pages ?? []).flatMap((p) => p.items);

  return (
    <div className="relative isolate overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-10 max-w-3xl space-y-3">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            {t("plannersEyebrow")}
          </p>
          <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {t("plannersTitle")}
          </h1>
          <p className="text-pretty text-sm text-muted-foreground sm:text-base">
            {t("plannersSubtitle")}
          </p>
        </header>

        <form
          className="mb-10 grid gap-2 rounded-2xl border border-rose-100/70 bg-white/85 p-3 backdrop-blur-sm sm:grid-cols-[1fr_220px_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(draft);
          }}
        >
          <Input
            value={draft.query}
            onChange={(e) => setDraft({ ...draft, query: e.target.value })}
            placeholder={t("searchPlaceholder")}
          />
          <Input
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            placeholder={t("locationPlaceholder")}
          />
          <label className="flex items-center gap-2 px-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.verifiedOnly}
              onChange={(e) =>
                setDraft({ ...draft, verifiedOnly: e.target.checked })
              }
              className="h-4 w-4 rounded border-rose-200 text-rose-600 focus:ring-rose-300"
            />
            {t("verifiedOnly")}
          </label>
          <Button
            type="submit"
            className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
          >
            <Search className="size-4" />
            {t("applyFilters")}
          </Button>
        </form>

        {list.isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-rose-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-16 text-center backdrop-blur-sm">
            <p className="font-display text-lg font-light tracking-tight">
              {t("noResultsTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noResultsBody")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => {
              const specialties = specialtiesArray(p.specialties);
              const rating = decimalToNumber(p.avg_rating);
              const cover = p.portfolio_items[0]?.image_url ?? null;
              return (
                <article
                  key={p.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 ring-1 ring-foreground/[0.04] backdrop-blur-sm transition-shadow hover:shadow-lg"
                >
                  <Link
                    href={`/planners/${p.id}`}
                    className="block aspect-[4/3] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60"
                  >
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt={p.business_name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <span className="font-display text-5xl font-light text-rose-700/60">
                          {p.business_name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="space-y-1">
                      <Link
                        href={`/planners/${p.id}`}
                        className="font-display text-lg font-medium tracking-tight hover:text-rose-700"
                      >
                        {p.business_name}
                      </Link>
                      {p.location && (
                        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" />
                          {p.location}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {p.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 ring-1 ring-emerald-100">
                          <CheckCircle2 className="size-3" />
                          {t("verifiedBadge")}
                        </span>
                      )}
                      {p.review_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Star className="size-3 fill-current" />
                          {rating.toFixed(1)} ·{" "}
                          {t("reviewsCount", { count: p.review_count })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("reviewsCount", { count: 0 })}
                        </span>
                      )}
                    </div>
                    {p.bio && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {p.bio}
                      </p>
                    )}
                    {specialties.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {specialties.slice(0, 4).map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 ring-1 ring-rose-100"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`/planners/${p.id}`} />}
                        className="w-full"
                      >
                        {t("viewProfile")}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {list.hasNextPage && (
          <div className="mt-10 flex justify-center">
            <Button
              variant="outline"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
              className="gap-2"
            >
              {list.isFetchingNextPage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {t("loadMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
