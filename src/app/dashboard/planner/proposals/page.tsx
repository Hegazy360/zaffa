"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  MapPin,
  Star,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { useFormatters } from "@/lib/use-formatters";
type StatusKey = "engaged" | "standing" | "backups" | "released" | "withdrew";

const TAB_KEYS: StatusKey[] = [
  "engaged",
  "standing",
  "backups",
  "released",
  "withdrew",
];

const TAB_LABEL_KEYS: Record<StatusKey, string> = {
  engaged: "tabEngaged",
  standing: "tabStandingBy",
  backups: "tabBackups",
  released: "tabReleasedLabel",
  withdrew: "tabWithdrew",
};

const TAB_DESC_KEYS: Record<StatusKey, string> = {
  engaged: "tabEngagedDesc",
  standing: "tabStandingDesc",
  backups: "tabBackupsDesc",
  released: "tabReleasedDesc",
  withdrew: "tabWithdrewDesc",
};

const TAB_EMPTY_KEYS: Record<StatusKey, string> = {
  engaged: "emptyEngaged",
  standing: "emptyStanding",
  backups: "emptyBackups",
  released: "emptyReleased",
  withdrew: "emptyWithdrew",
};

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

export default function ProposalsPage() {
  const t = useTranslations("planner");
  const [tab, setTab] = useState<StatusKey>("engaged");
  const { data: proposals, isLoading } = trpc.proposals.mine.useQuery();

  const grouped = useMemo(() => {
    const result: Record<StatusKey, typeof proposals> = {
      engaged: [],
      standing: [],
      backups: [],
      released: [],
      withdrew: [],
    };
    (proposals ?? []).forEach((p) => {
      if (p.status === "accepted") result.engaged!.push(p);
      else if (p.status === "released") result.released!.push(p);
      else if (p.status === "declined") result.withdrew!.push(p);
      else if (p.status === "pending") {
        if (p.event.engaged_with_other) result.backups!.push(p);
        else result.standing!.push(p);
      }
    });
    return result;
  }, [proposals]);

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
            <FileText className="size-3" />
            {t("proposalsEyebrow")}
          </div>
          <h1 className="font-display mt-3 text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {t("proposalsTitle")}
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-sm text-muted-foreground sm:text-base">
            {t("proposalsSubtitle")}
          </p>
        </header>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as StatusKey)}
        >
          <TabsList className="mb-2 flex w-full justify-start snap-x scroll-px-1 gap-1 overflow-x-auto bg-rose-50/60 p-1 ring-1 ring-rose-100/70 sm:justify-center sm:overflow-visible">
            {TAB_KEYS.map((key) => {
              const count = grouped[key]?.length ?? 0;
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="shrink-0 snap-start gap-1.5 px-3 sm:flex-1 sm:px-1.5"
                >
                  {t(TAB_LABEL_KEYS[key])}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-xs font-medium",
                      tab === key
                        ? "bg-rose-100 text-rose-700"
                        : "bg-white/70 text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <p className="mb-6 text-xs text-muted-foreground">
            {t(TAB_DESC_KEYS[tab])}
          </p>

          {TAB_KEYS.map((key) => (
            <TabsContent key={key} value={key}>
              {isLoading ? (
                <ProposalsSkeleton />
              ) : (grouped[key]?.length ?? 0) === 0 ? (
                <Empty body={t(TAB_EMPTY_KEYS[key])} />
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {grouped[key]!.map((p) => (
                    <ProposalCard key={p.id} proposal={p} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

interface ProposalRow {
  id: string;
  status: string;
  cover_letter: string;
  quote_amount: unknown;
  quote_currency: string;
  release_reason: string | null;
  release_rating: number | null;
  event: {
    id: string;
    title: string;
    event_type: string;
    event_date: Date | null;
    venue: string | null;
    client_first_name: string;
    heroImage: string | null;
    palette: unknown;
    engaged_with_other: boolean;
  };
}

function ProposalCard({ proposal }: { proposal: ProposalRow }) {
  const f = useFormatters();
  const t = useTranslations("planner");
  const palette = normalizePalette(proposal.event.palette);
  const amount = decimalToNumber(proposal.quote_amount);
  const isAccepted = proposal.status === "accepted";
  const isReleased = proposal.status === "released";
  const isBackup = proposal.event.engaged_with_other && proposal.status === "pending";

  const href = isAccepted
    ? `/dashboard/planner/event/${proposal.event.id}`
    : `/dashboard/planner/marketplace/${proposal.event.id}`;

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm ring-1 ring-foreground/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)]">
      <Link href={href} className="block">
        <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
          {proposal.event.heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proposal.event.heroImage}
              alt={proposal.event.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="size-7 text-rose-400/70" />
            </div>
          )}
          {isAccepted && (
            <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-emerald-600/90 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-white backdrop-blur-sm">
              {t("engagedBadge")}
            </span>
          )}
          {isBackup && (
            <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-amber-500/90 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-white backdrop-blur-sm">
              {t("backupBadge")}
            </span>
          )}
          {isReleased && (
            <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-stone-700/85 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-white backdrop-blur-sm">
              {t("releasedBadge")}
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
      </Link>
      <div className="space-y-2 p-4">
        <h3 className="font-display text-base font-medium leading-tight tracking-tight">
          {proposal.event.title}
        </h3>
        <p className="text-xs capitalize text-muted-foreground">
          {t("typeWithFirstName", {
            type: proposal.event.event_type,
            firstName: proposal.event.client_first_name,
          })}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" />
            {proposal.event.event_date
              ? f.date(proposal.event.event_date, "medium")
              : t("dateOpen")}
          </span>
          {proposal.event.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              <span className="max-w-[120px] truncate">
                {proposal.event.venue}
              </span>
            </span>
          )}
        </div>
        {amount > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("quoteWithAmount", {
              amount: f.currency(amount, proposal.quote_currency),
            })}
          </p>
        )}
        {isReleased && proposal.release_rating && (
          <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-700">
            <p className="flex items-center gap-1 text-eyebrow font-medium text-stone-500">
              {t("theirFeedback")}
              <span className="inline-flex items-center gap-0.5 text-amber-600">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "size-3",
                      i < (proposal.release_rating ?? 0)
                        ? "fill-current text-amber-500"
                        : "text-stone-300"
                    )}
                  />
                ))}
              </span>
            </p>
            {proposal.release_reason && (
              <p className="mt-1 italic">&ldquo;{proposal.release_reason}&rdquo;</p>
            )}
          </div>
        )}
        <div className="pt-1">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={href} />}
            className="-ms-2 gap-1 text-xs"
          >
            {isAccepted ? t("openEvent") : t("viewBrief")}
            <ArrowRight className="size-3 rtl:-scale-x-100" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function ProposalsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl bg-card/80 ring-1 ring-foreground/[0.06]"
        >
          <div className="aspect-[16/9] animate-pulse bg-gradient-to-br from-rose-50 to-amber-50/60" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ body }: { body: string }) {
  const t = useTranslations("planner");
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-16 text-center backdrop-blur-sm">
      <div className="mb-5 grid size-14 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
        <FileText className="size-6 text-rose-600" />
      </div>
      <h3 className="font-display text-xl font-light tracking-tight">
        {t("nothingHereYet")}
      </h3>
      <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
