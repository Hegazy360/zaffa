"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Compass,
  Image as ImageIcon,
  MapPin,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFormatters } from "@/lib/use-formatters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EventTypeFilter =
  | "all"
  | "wedding"
  | "engagement"
  | "birthday"
  | "corporate"
  | "other";

const EVENT_TYPE_KEYS: ReadonlyArray<{
  value: EventTypeFilter;
  labelKey:
    | "allEventTypes"
    | "wedding"
    | "engagement"
    | "birthday"
    | "corporate"
    | "other";
}> = [
  { value: "all", labelKey: "allEventTypes" },
  { value: "wedding", labelKey: "wedding" },
  { value: "engagement", labelKey: "engagement" },
  { value: "birthday", labelKey: "birthday" },
  { value: "corporate", labelKey: "corporate" },
  { value: "other", labelKey: "other" },
];

function normalizePalette(value: unknown): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.colors)) {
      return obj.colors.filter((c): c is string => typeof c === "string");
    }
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

export default function MarketplacePage() {
  const t = useTranslations("marketplace");
  const f = useFormatters();
  const [eventType, setEventType] = useState<EventTypeFilter>("all");
  const [hasBudget, setHasBudget] = useState(false);

  const eventTypeOptions = useMemo(
    () =>
      EVENT_TYPE_KEYS.map((opt) => ({
        value: opt.value,
        label: t(opt.labelKey),
      })),
    [t],
  );

  const { data: planner } = trpc.planner.me.useQuery();
  const { data: briefs, isLoading } = trpc.marketplace.list.useQuery(
    {
      event_type: eventType === "all" ? undefined : eventType,
      has_budget: hasBudget || undefined,
    },
    { enabled: !!planner }
  );

  const visible = useMemo(() => briefs ?? [], [briefs]);

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <header className="mb-10 flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-rose-700 backdrop-blur-sm">
            <Compass className="size-3" />
            {t("eyebrow")}
          </div>
          <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="max-w-xl text-pretty text-sm text-muted-foreground sm:text-base">
            {t("subtitle")}
          </p>
        </header>

        {/* Filters */}
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-rose-100/70 bg-white/70 p-3 backdrop-blur-sm">
          <span className="ms-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {t("filter")}
          </span>
          <Select
            items={eventTypeOptions}
            value={eventType}
            onValueChange={(v) => setEventType(v as EventTypeFilter)}
          >
            <SelectTrigger className="h-8 min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eventTypeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => setHasBudget((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all",
              hasBudget
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-rose-100 bg-transparent text-muted-foreground hover:bg-rose-50/40"
            )}
          >
            {hasBudget && <Check className="size-3" />}
            {t("budgetShared")}
          </button>
        </div>

        {!planner ? (
          <EmptyState
            title={t("plannerProfileRequired")}
            body={t("plannerProfileRequiredBody")}
            ctaHref="/dashboard/planner/settings"
            ctaLabel={t("setUpProfile")}
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl bg-card/80 ring-1 ring-foreground/[0.06]"
              >
                <div className="aspect-[4/3] animate-pulse bg-gradient-to-br from-rose-50 to-amber-50/60" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title={t("noOpenBriefs")}
            body={t("noOpenBriefsBody")}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((brief) => {
              const palette = normalizePalette(brief.design?.palette);
              const heroImage = brief.design?.heroImage ?? null;
              const budgetNumber = decimalToNumber(brief.budget);
              const budget =
                budgetNumber > 0 ? f.currency(budgetNumber) : null;
              return (
                <Link
                  key={brief.id}
                  href={`/dashboard/planner/marketplace/${brief.id}`}
                  className="group relative block overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm ring-1 ring-foreground/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
                    {heroImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={heroImage}
                        alt={brief.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="size-7 text-rose-400/70" />
                      </div>
                    )}
                    {brief.myProposal && (
                      <span className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
                        <Sparkles className="size-2.5" />
                        {t("alreadyProposed")}
                      </span>
                    )}
                    {palette.length > 0 && (
                      <div className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-sm">
                        {palette.slice(0, 4).map((c) => (
                          <span
                            key={c}
                            className="block size-2 rounded-full ring-1 ring-white/40"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <h3 className="font-display text-base font-medium leading-tight tracking-tight">
                      {brief.title}
                    </h3>
                    <p className="text-[11px] capitalize text-muted-foreground">
                      {t("withClient", {
                        type: brief.event_type,
                        firstName: brief.client_first_name,
                      })}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {brief.event_date
                          ? f.date(brief.event_date, "medium")
                          : t("dateOpen")}
                      </span>
                      {brief.venue && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          <span className="max-w-[120px] truncate">
                            {brief.venue}
                          </span>
                        </span>
                      )}
                      {budget && (
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-100">
                          {budget}
                        </span>
                      )}
                    </div>
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

function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-16 text-center backdrop-blur-sm">
      <div className="mb-5 grid size-14 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
        <Compass className="size-6 text-rose-600" />
      </div>
      <h3 className="font-display text-xl font-light tracking-tight">{title}</h3>
      <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
        {body}
      </p>
      {ctaHref && ctaLabel && (
        <Button
          render={<Link href={ctaHref} />}
          className="mt-6 h-10 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-5 text-white shadow-md shadow-rose-500/20 hover:opacity-90"
        >
          {ctaLabel}
          <ArrowRight className="size-4 rtl:-scale-x-100" />
        </Button>
      )}
    </div>
  );
}
