"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Compass,
  FileText,
  ImageIcon,
  MapPin,
  Sparkles,
  Star,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

interface NormalizedPalette {
  colors: string[];
}

function normalizePalette(value: unknown): NormalizedPalette {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const colors = Array.isArray(obj.colors)
      ? obj.colors.filter((c): c is string => typeof c === "string")
      : [];
    return { colors };
  }
  return { colors: [] };
}

function formatEventDate(date: Date | string | null | undefined): string {
  if (!date) return "Date not set";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatType(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

export default function PlannerDashboardPage() {
  const { data: planner, isLoading: plannerLoading } =
    trpc.planner.me.useQuery();
  const { data: stats } = trpc.planner.stats.useQuery(undefined, {
    enabled: !!planner,
  });
  const { data: marketplace } = trpc.marketplace.list.useQuery(undefined, {
    enabled: !!planner,
  });
  const { data: myProposals } = trpc.proposals.mine.useQuery(undefined, {
    enabled: !!planner,
  });

  const today = new Date();
  const { data: month } = trpc.availability.forMonth.useQuery(
    { year: today.getFullYear(), month: today.getMonth() + 1 },
    { enabled: !!planner }
  );

  if (plannerLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-12">
        <div className="h-12 w-72 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!planner) {
    return <PlannerSetupNeeded />;
  }

  const firstName =
    planner.profile.full_name.split(" ")[0] ?? planner.business_name;
  const newBriefs = (marketplace ?? [])
    .filter((b) => !b.myProposal)
    .slice(0, 4);
  const engaged = (myProposals ?? []).filter((p) => p.status === "accepted");

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl dark:from-rose-900/15 dark:to-amber-900/10"
      />

      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        {/* Hero */}
        <header className="mb-12 flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-rose-700 backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
              <Sparkles className="size-3" />
              Atelier console
            </div>
            <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
              Welcome, {firstName}.
            </h1>
            <p className="max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
              {planner.business_name} — fresh briefs, your active engagements,
              and the month ahead.
            </p>
          </div>
          <Button
            size="lg"
            render={<Link href="/dashboard/planner/marketplace" />}
            className="group h-11 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-5 text-white shadow-lg shadow-rose-500/20 hover:opacity-90 hover:shadow-rose-500/30"
          >
            <Compass className="size-4" />
            Browse marketplace
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </header>

        {/* Stats */}
        <section className="mb-14 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Active engagements"
            value={stats?.activeEngagements ?? 0}
            icon={<FileText className="size-4 text-rose-600" />}
          />
          <StatCard
            label="Standing by"
            value={stats?.pendingProposals ?? 0}
            icon={<Sparkles className="size-4 text-amber-500" />}
          />
          <StatCard
            label="Avg rating"
            value={
              stats?.reviewCount
                ? decimalToNumber(stats.avgRating).toFixed(1)
                : "—"
            }
            icon={<Star className="size-4 text-amber-500" />}
            sublabel={
              stats?.reviewCount
                ? `${stats.reviewCount} review${stats.reviewCount === 1 ? "" : "s"}`
                : "No reviews yet"
            }
          />
          <StatCard
            label="Released"
            value={stats?.releasedCount ?? 0}
            icon={<CalendarDays className="size-4 text-stone-500" />}
            sublabel="Past engagements"
          />
        </section>

        {/* New briefs */}
        <section className="mb-14">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
                New briefs
              </p>
              <h2 className="font-display text-2xl font-light tracking-tight">
                Open events looking for a planner
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/dashboard/planner/marketplace" />}
              className="gap-1 text-sm"
            >
              View all
              <ArrowRight className="size-3.5" />
            </Button>
          </div>

          {newBriefs.length === 0 ? (
            <EmptyCard
              icon={<Compass className="size-6 text-rose-600" />}
              title="No new briefs right now"
              body="When clients approve a design and start looking for a planner, they show up here."
              ctaHref="/dashboard/planner/marketplace"
              ctaLabel="Browse marketplace"
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {newBriefs.map((brief) => (
                <BriefCard key={brief.id} brief={brief} />
              ))}
            </div>
          )}
        </section>

        <div aria-hidden className="champagne-hairline mb-14 h-px w-full" />

        {/* Engagements */}
        <section className="mb-14">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
                Currently engaged
              </p>
              <h2 className="font-display text-2xl font-light tracking-tight">
                Events you&apos;re actively planning
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/dashboard/planner/proposals" />}
              className="gap-1 text-sm"
            >
              All proposals
              <ArrowRight className="size-3.5" />
            </Button>
          </div>

          {engaged.length === 0 ? (
            <EmptyCard
              icon={<Sparkles className="size-6 text-rose-600" />}
              title="No active engagements yet"
              body="Once a client accepts your proposal, the event will live here for quick access."
              ctaHref="/dashboard/planner/marketplace"
              ctaLabel="Find your first brief"
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {engaged.slice(0, 6).map((p) => (
                <EngagementCard key={p.id} proposal={p} />
              ))}
            </div>
          )}
        </section>

        <div aria-hidden className="champagne-hairline mb-14 h-px w-full" />

        {/* Upcoming month */}
        <section>
          <div className="mb-6">
            <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
              The month ahead
            </p>
            <h2 className="font-display text-2xl font-light tracking-tight">
              {today.toLocaleString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <MonthList
              title="Booked"
              accent="rose"
              empty="No bookings this month."
              items={(month?.bookedEvents ?? []).map((e) => ({
                id: e.id,
                left: e.title,
                right: formatEventDate(e.event_date),
                href: `/dashboard/planner/event/${e.id}`,
              }))}
            />
            <MonthList
              title="Blocked"
              accent="stone"
              empty="No blocked dates this month."
              items={(month?.blocks ?? []).map((b) => ({
                id: b.id,
                left: b.reason ?? "Personal",
                right: `${formatEventDate(b.start_date)} → ${formatEventDate(b.end_date)}`,
                href: "/dashboard/planner/schedule",
              }))}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  sublabel,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-5 backdrop-blur-sm ring-1 ring-foreground/[0.04] dark:border-rose-900/30 dark:bg-card/80">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        <span className="grid size-7 place-items-center rounded-full bg-rose-50/80 ring-1 ring-rose-100/70">
          {icon}
        </span>
      </div>
      <p className="font-display text-3xl font-light leading-none tracking-tight">
        {value}
      </p>
      {sublabel && (
        <p className="mt-2 text-[11px] text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}

interface BriefCardProps {
  brief: {
    id: string;
    title: string;
    event_type: string;
    event_date: Date | null;
    venue: string | null;
    client_first_name: string;
    design: { palette: unknown; heroImage: string | null } | null;
  };
}

function BriefCard({ brief }: BriefCardProps) {
  const palette = normalizePalette(brief.design?.palette);
  const heroImage = brief.design?.heroImage ?? null;
  return (
    <Link
      href={`/dashboard/planner/marketplace/${brief.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm ring-1 ring-foreground/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)] dark:border-rose-900/30 dark:bg-card/80"
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
        {palette.colors.length > 0 && (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-sm">
            {palette.colors.slice(0, 4).map((c) => (
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
          {formatType(brief.event_type)} · with {brief.client_first_name}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" />
            {formatEventDate(brief.event_date)}
          </span>
        </div>
      </div>
    </Link>
  );
}

interface EngagementProposal {
  id: string;
  status: string;
  event: {
    id: string;
    title: string;
    event_type: string;
    event_date: Date | null;
    venue: string | null;
    client_first_name: string;
    heroImage: string | null;
    palette: unknown;
  };
}

function EngagementCard({ proposal }: { proposal: EngagementProposal }) {
  const palette = normalizePalette(proposal.event.palette);
  return (
    <Link
      href={`/dashboard/planner/event/${proposal.event.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm ring-1 ring-foreground/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)] dark:border-rose-900/30 dark:bg-card/80"
    >
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
        <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-rose-600/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
          Engaged
        </span>
        {palette.colors.length > 0 && (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-sm">
            {palette.colors.slice(0, 4).map((c) => (
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
          {proposal.event.title}
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" />
            {formatEventDate(proposal.event.event_date)}
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
        <p className="text-[11px] capitalize text-muted-foreground">
          {formatType(proposal.event.event_type)} · with{" "}
          {proposal.event.client_first_name}
        </p>
      </div>
    </Link>
  );
}

function MonthList({
  title,
  empty,
  items,
  accent,
}: {
  title: string;
  empty: string;
  items: { id: string; left: string; right: string; href: string }[];
  accent: "rose" | "stone";
}) {
  return (
    <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-5 backdrop-blur-sm ring-1 ring-foreground/[0.04] dark:border-rose-900/30 dark:bg-card/80">
      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={it.href}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-rose-50/60"
              >
                <span className="flex items-center gap-2 truncate font-medium">
                  <span
                    aria-hidden
                    className={
                      accent === "rose"
                        ? "block size-2 rounded-full bg-gradient-to-br from-rose-500 to-amber-500"
                        : "block size-2 rounded-full bg-stone-400"
                    }
                  />
                  <span className="truncate">{it.left}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {it.right}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyCard({
  icon,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-16 text-center backdrop-blur-sm dark:border-rose-900/40 dark:bg-card/40">
      <div className="mb-5 grid size-14 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
        {icon}
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
          <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
  );
}

function PlannerSetupNeeded() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-8 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
        <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
          Almost there
        </p>
        <h1 className="font-display text-3xl font-light tracking-tight">
          Set up your planner profile
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Your account isn&apos;t a planner yet. Add your business name, bio,
          and specialties to start receiving briefs from couples.
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            render={<Link href="/dashboard/planner/settings" />}
            className="bg-gradient-to-r from-rose-600 to-amber-500 text-white"
          >
            Set up profile
          </Button>
        </div>
      </div>
    </div>
  );
}
