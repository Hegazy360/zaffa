"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ImageIcon,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EnquiryStatusCard } from "@/components/dashboard/enquiry-status-card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { useFormatters } from "@/lib/use-formatters";
import type { EventStatus, EventType } from "@/types";
import { EmptyState } from "@/components/ui/empty-state";
import { MediaImage } from "@/components/ui/media-image";

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

function formatEventType(type: EventType | string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

const statusStyles: Record<EventStatus | string, string> = {
  draft: "bg-stone-100 text-stone-700 ring-stone-200",
  planning: "bg-amber-50 text-amber-800 ring-amber-200",
  confirmed: "bg-rose-50 text-rose-700 ring-rose-200",
  in_progress: "bg-amber-100 text-amber-900 ring-amber-300",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-stone-50 text-stone-500 ring-stone-200",
};

export default function ClientDashboardPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const t = useTranslations("dashboard");
  const tc = useTranslations("client");
  const tCommon = useTranslations("common");

  const { data: profile } = trpc.profile.me.useQuery();
  const { data: designs, isLoading: designsLoading } =
    trpc.venueDesigns.list.useQuery();
  const { data: events, isLoading: eventsLoading } =
    trpc.events.list.useQuery();

  const createFromDesign = trpc.events.createFromDesign.useMutation({
    onSuccess: (event) => {
      utils.events.list.invalidate();
      utils.venueDesigns.list.invalidate();
      toast.success(tc("createdFromDesignToast"));
      router.push(`/dashboard/client/event/${event.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl"
      />

      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        {/* Live enquiry, if any. Renders nothing otherwise, and disappears
            once the enquiry converts and the package card takes over. */}
        <EnquiryStatusCard />

        {/* Hero */}
        <header className="mb-12 flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
              <Sparkles className="size-3" />
              {t("clientEyebrow")}
            </div>
            <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
              {t("clientWelcome", { name: firstName })}
            </h1>
            <p className="max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
              {t("clientSubtitle")}
            </p>
          </div>
          <Button
            size="lg"
            render={<Link href="/venue-designer/new" />}
            className="group h-11 gap-2 bg-brand-gradient px-5 text-white shadow-glow hover:opacity-90 hover:shadow-glow-lg"
          >
            <Wand2 className="size-4" />
            {t("clientStartNewDesign")}
            <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Button>
        </header>

        {/* Designs rail */}
        <section className="mb-14">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
                {tc("yourDesigns")}
              </p>
              <h2 className="font-display text-2xl font-light tracking-tight">
                {tc("approveDesignToBegin")}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/venue-designer" />}
              className="gap-1 text-sm"
            >
              {tc("viewAll")}
              <ArrowRight className="size-3.5 rtl:-scale-x-100" />
            </Button>
          </div>

          {designsLoading ? (
            <SkeletonRegion
              label={tCommon("loading")}
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl bg-card/80 ring-1 ring-foreground/[0.06]"
                >
                  <Skeleton className="aspect-[4/3] rounded-none" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </SkeletonRegion>
          ) : !designs || designs.length === 0 ? (
            <DesignsEmptyState onStart={() => router.push("/venue-designer/new")} />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {designs.slice(0, 6).map((design) => {
                const palette = normalizePalette(design.palette);
                const heroImage = design.media[0]?.url ?? design.thumbnail ?? null;
                const isAttached = events?.some((e) =>
                  e.designs.some((d) => d.id === design.id)
                );

                return (
                  <article
                    key={design.id}
                    className="group relative overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm ring-1 ring-foreground/[0.04] transition-all hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)]"
                  >
                    <Link
                      href={`/venue-designer/${design.id}`}
                      className="block"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                        {heroImage ? (
                          <MediaImage
                            src={heroImage}
                            alt={design.name}
                            fill
                            sizes="card"
                            className="transition-transform duration-500 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-50 via-rose-50/60 to-amber-50">
                            <Sparkles className="size-7 text-rose-400/70" />
                          </div>
                        )}
                        {palette.colors.length > 0 && (
                          <div className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-sm">
                            {palette.colors.slice(0, 4).map((c) => (
                              <span
                                key={c}
                                className="block size-2 rounded-full ring-1 ring-white/40"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        )}
                        {isAttached && (
                          <div className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-rose-600/90 px-2 py-1 text-xs font-medium tracking-wide text-white backdrop-blur-sm">
                            <CheckCircle2 className="size-3" />
                            {tc("approvedTag")}
                          </div>
                        )}
                      </div>
                    </Link>

                    <div className="space-y-3 p-4">
                      <div>
                        <h3 className="font-display text-base font-medium leading-tight tracking-tight">
                          {design.name}
                        </h3>
                        <p className="mt-1 text-xs capitalize text-muted-foreground">
                          {design.event_type} · {design.size} · {design.setting}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isAttached ? (
                          <Button
                            variant="outline"
                            size="sm"
                            render={
                              <Link href={`/venue-designer/${design.id}`} />
                            }
                            className="h-8 flex-1 gap-1 text-xs"
                          >
                            {tc("open")}
                            <ArrowRight className="size-3 rtl:-scale-x-100" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={createFromDesign.isPending}
                            onClick={() =>
                              createFromDesign.mutate({ designId: design.id })
                            }
                            className="h-8 flex-1 gap-1 bg-brand-gradient text-xs text-white hover:opacity-90"
                          >
                            {createFromDesign.isPending &&
                            createFromDesign.variables?.designId === design.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3" />
                            )}
                            {tc("approveCreateEvent")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div aria-hidden className="champagne-hairline mb-14 h-px w-full" />

        {/* Events rail */}
        <section>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
                {tc("yourEvents")}
              </p>
              <h2 className="font-display text-2xl font-light tracking-tight">
                {tc("everythingInOnePlace")}
              </h2>
            </div>
          </div>

          {eventsLoading ? (
            <SkeletonRegion
              label={tCommon("loading")}
              className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </SkeletonRegion>
          ) : !events || events.length === 0 ? (
            <EventsEmptyState />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

interface EventListItem {
  id: string;
  title: string;
  event_type: string;
  event_date: Date | null;
  venue: string | null;
  budget: unknown;
  status: string;
  created_at: Date;
  designs: Array<{
    id: string;
    name: string;
    thumbnail: string | null;
    palette: unknown;
    media: Array<{ url: string }>;
  }>;
}

function EventCard({ event }: { event: EventListItem }) {
  const tc = useTranslations("client");
  const f = useFormatters();
  const heroImage =
    event.designs[0]?.media[0]?.url ?? event.designs[0]?.thumbnail ?? null;
  const palette = normalizePalette(event.designs[0]?.palette);
  const statusKey = statusLabelKey(event.status);

  return (
    <Link
      href={`/dashboard/client/event/${event.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm ring-1 ring-foreground/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
        {heroImage ? (
          <MediaImage
            src={heroImage}
            alt={event.title}
            fill
            sizes="card"
            className="transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="size-7 text-rose-400/70" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        <span
          className={cn(
            "absolute start-3 top-3 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 backdrop-blur-sm",
            statusStyles[event.status] ?? statusStyles.draft
          )}
        >
          {tc(statusKey)}
        </span>
        {palette.colors.length > 0 && (
          <div className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-sm">
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
          {event.title}
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" />
            {event.event_date ? f.date(event.event_date, "long") : tc("dateNotSet")}
          </span>
          {event.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              <span className="max-w-[120px] truncate">{event.venue}</span>
            </span>
          )}
        </div>
        <p className="text-xs capitalize text-muted-foreground">
          {formatEventType(event.event_type)}
          {event.designs[0] && ` · ${tc("linkedTo", { name: event.designs[0].name })}`}
        </p>
      </div>
    </Link>
  );
}

type ClientStatusKey =
  | "statusDraft"
  | "statusPlanning"
  | "statusConfirmed"
  | "statusInProgress"
  | "statusCompleted"
  | "statusCancelled";

function statusLabelKey(status: string): ClientStatusKey {
  switch (status) {
    case "planning":
      return "statusPlanning";
    case "confirmed":
      return "statusConfirmed";
    case "in_progress":
      return "statusInProgress";
    case "completed":
      return "statusCompleted";
    case "cancelled":
      return "statusCancelled";
    default:
      return "statusDraft";
  }
}

function DesignsEmptyState({ onStart }: { onStart: () => void }) {
  const tc = useTranslations("client");
  return (
    <EmptyState
      icon={Wand2}
      title={tc("noDesignsYet")}
      description={tc("noDesignsBody")}
      action={
        <Button variant="cta" onClick={onStart} className="h-10 gap-2 px-5">
          <Plus className="size-4" />
          {tc("createFirstDesign")}
        </Button>
      }
    />
  );
}

function EventsEmptyState() {
  const tc = useTranslations("client");
  return (
    <EmptyState
      icon={CalendarDays}
      title={tc("noEventsYet")}
      description={tc("noEventsBody")}
    />
  );
}
