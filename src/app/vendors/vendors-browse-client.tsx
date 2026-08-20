"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Search, Star, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { decimalToNumber } from "@/lib/payments";
import { useFormatters } from "@/lib/use-formatters";

const CATEGORY_VALUES = [
  "all",
  "catering",
  "photography",
  "videography",
  "flowers",
  "music",
  "decoration",
  "venue",
  "makeup",
  "fashion",
  "transportation",
  "other",
] as const;

type CategoryOption = (typeof CATEGORY_VALUES)[number];

const CATEGORY_LABEL_KEYS: Record<CategoryOption, string> = {
  all: "categoryAll",
  catering: "categoryCatering",
  photography: "categoryPhotography",
  videography: "categoryVideography",
  flowers: "categoryFlowers",
  music: "categoryMusic",
  decoration: "categoryDecoration",
  venue: "categoryVenue",
  makeup: "categoryMakeup",
  fashion: "categoryFashion",
  transportation: "categoryTransportation",
  other: "categoryOther",
};

interface FilterState {
  category: CategoryOption;
  location: string;
  query: string;
}

const PAGE_SIZE = 24;

export function VendorsBrowseClient() {
  const t = useTranslations("browse");
  const f = useFormatters();
  const [draft, setDraft] = useState<FilterState>({
    category: "all",
    location: "",
    query: "",
  });
  const [filters, setFilters] = useState<FilterState>(draft);

  const list = trpc.vendors.search.useInfiniteQuery(
    {
      category: filters.category === "all" ? undefined : filters.category,
      location: filters.location || undefined,
      query: filters.query || undefined,
      take: PAGE_SIZE,
    },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const categoryItems = useMemo(
    () =>
      CATEGORY_VALUES.map((value) => ({
        value,
        label: t(CATEGORY_LABEL_KEYS[value]),
      })),
    [t],
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
            {t("vendorsEyebrow")}
          </p>
          <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {t("vendorsTitle")}
          </h1>
          <p className="text-pretty text-sm text-muted-foreground sm:text-base">
            {t("vendorsSubtitle")}
          </p>
        </header>

        <form
          className="mb-10 grid gap-2 rounded-2xl border border-brand-line bg-white/85 p-3 backdrop-blur-sm sm:grid-cols-[1fr_220px_220px_auto]"
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
          <Select
            items={categoryItems}
            value={draft.category}
            onValueChange={(value) =>
              setDraft({ ...draft, category: value as CategoryOption })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="submit"
            className="gap-1.5 bg-brand-gradient text-white"
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
            {items.map((v) => {
              const rating = decimalToNumber(v.avg_rating);
              const minPrice = v.services.reduce<number | null>((acc, s) => {
                const p = decimalToNumber(s.price_from);
                if (!Number.isFinite(p) || p <= 0) return acc;
                return acc == null ? p : Math.min(acc, p);
              }, null);
              return (
                <article
                  key={v.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-brand-line bg-white/80 ring-1 ring-foreground/[0.04] backdrop-blur-sm transition-shadow hover:shadow-lg"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
                    {v.profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.profile.avatar_url}
                        alt={v.business_name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <Store className="size-10 text-rose-700/40" />
                      </div>
                    )}
                    <span className="absolute end-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-rose-700 ring-1 ring-rose-100 backdrop-blur">
                      {t(`category${capitalize(v.category)}` as const)}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="space-y-1">
                      <Link
                        href={`/vendors/${v.id}`}
                        className="font-display text-lg font-medium tracking-tight hover:text-rose-700"
                      >
                        {v.business_name}
                      </Link>
                      {v.location && (
                        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" />
                          {v.location}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {v._count.reviews > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Star className="size-3 fill-current" />
                          {rating.toFixed(1)} ·{" "}
                          {t("reviewsCount", { count: v._count.reviews })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("reviewsCount", { count: 0 })}
                        </span>
                      )}
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        {t("servicesCount", { count: v._count.services })}
                      </span>
                    </div>
                    {v.bio && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {v.bio}
                      </p>
                    )}
                    {minPrice != null && (
                      <p className="text-xs text-muted-foreground">
                        {t("from")}{" "}
                        <span className="font-display text-base text-foreground">
                          {f.currency(minPrice)}
                        </span>
                      </p>
                    )}
                    <div className="mt-auto pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`/vendors/${v.id}`} />}
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
