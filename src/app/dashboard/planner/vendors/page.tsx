"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Search, Star, Store } from "lucide-react";
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
import { decimalToNumber, formatCurrency } from "@/lib/payments";

const CATEGORIES = [
  { value: "all", label: "All categories" },
  { value: "catering", label: "Catering" },
  { value: "photography", label: "Photography" },
  { value: "videography", label: "Videography" },
  { value: "flowers", label: "Flowers" },
  { value: "music", label: "Music" },
  { value: "decoration", label: "Decoration" },
  { value: "venue", label: "Venue" },
  { value: "makeup", label: "Makeup" },
  { value: "fashion", label: "Fashion" },
  { value: "transportation", label: "Transportation" },
  { value: "other", label: "Other" },
] as const;

type CategoryOption = (typeof CATEGORIES)[number]["value"];

export default function PlannerVendorsPage() {
  const [category, setCategory] = useState<CategoryOption>("all");
  const [location, setLocation] = useState("");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState({ category: "all" as CategoryOption, location: "", query: "" });

  const search = trpc.vendors.search.useQuery({
    category: submitted.category === "all" ? undefined : submitted.category,
    location: submitted.location || undefined,
    query: submitted.query || undefined,
    take: 30,
  });

  function imagesArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === "string");
    }
    return [];
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8 space-y-2">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            Vendors
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
            Build the team for the night
          </h1>
          <p className="text-sm text-muted-foreground">
            Florists, catering, photographers, music — search by category and
            location, then book line by line.
          </p>
        </header>

        <form
          className="mb-8 grid gap-2 rounded-2xl border border-rose-100/70 bg-white/85 p-3 backdrop-blur-sm sm:grid-cols-[1fr_220px_220px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted({ category, location, query });
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or specialty"
          />
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (e.g. Cairo)"
          />
          <Select
            items={CATEGORIES}
            value={category}
            onValueChange={(v) => v && setCategory(v as CategoryOption)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="submit"
            className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
          >
            <Search className="size-4" />
            Search
          </Button>
        </form>

        {search.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : (search.data?.items.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-12 text-center backdrop-blur-sm">
            <Store className="mx-auto mb-3 size-8 text-rose-500" />
            <p className="font-display text-xl font-light tracking-tight">
              No vendors match yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Loosen the filters and try again — we&apos;re still onboarding
              talent.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {search.data!.items.map((v) => {
              const services = v.services ?? [];
              const featuredImg =
                services
                  .map((s) => imagesArray(s.images)[0])
                  .find((u): u is string => typeof u === "string") ?? null;
              return (
                <Link
                  key={v.id}
                  href={`/dashboard/planner/vendors/${v.id}`}
                  className="group overflow-hidden rounded-2xl border border-rose-100/70 bg-white/85 backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-rose-50">
                    {featuredImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={featuredImg}
                        alt={v.business_name}
                        className="size-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-rose-300">
                        <Store className="size-8" />
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-stone-900/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
                      {v.category}
                    </span>
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-medium leading-tight">
                        {v.business_name}
                      </p>
                      <span className="inline-flex items-center gap-0.5 text-xs">
                        <Star className="size-3 text-amber-500" />
                        {Number(v.avg_rating).toFixed(1)}
                        <span className="ml-0.5 text-muted-foreground">
                          ({v._count.reviews})
                        </span>
                      </span>
                    </div>
                    {v.location && (
                      <p className="text-xs text-muted-foreground">
                        {v.location}
                      </p>
                    )}
                    {v.bio && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {v.bio}
                      </p>
                    )}
                    {services.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {services.slice(0, 3).map((s) => (
                          <span
                            key={s.id}
                            className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-800 ring-1 ring-rose-100"
                          >
                            {s.name} ·{" "}
                            <span className="font-mono">
                              {formatCurrency(decimalToNumber(s.price_from))}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
