"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  CreditCard,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserCircle,
  Users,
  Wand2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SchedulePanel } from "@/components/payments/SchedulePanel";
import { useRealtimeMessageSync } from "@/hooks/use-realtime-messages";

import { useFormatters } from "@/lib/use-formatters";
const TABS = ["overview", "design", "vendors", "payments", "messages"] as const;
type TabValue = (typeof TABS)[number];

const statusStyles: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700 ring-stone-200",
  planning: "bg-amber-50 text-amber-800 ring-amber-200",
  confirmed: "bg-rose-50 text-rose-700 ring-rose-200",
  in_progress: "bg-amber-100 text-amber-900 ring-amber-300",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-stone-50 text-stone-500 ring-stone-200",
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
  if (typeof value === "string") return parseFloat(value) || 0;
  if (typeof value === "object" && "toString" in (value as object)) {
    return parseFloat((value as { toString(): string }).toString()) || 0;
  }
  return 0;
}

// Module-level cached "now" for the days-until widget — same pattern as the
// client event page so we don't blow the React update depth.
let cachedNow = 0;
const nowListeners = new Set<() => void>();
let nowInterval: ReturnType<typeof setInterval> | null = null;

function ensureNowInterval() {
  if (nowInterval !== null) return;
  cachedNow = Date.now();
  nowInterval = setInterval(() => {
    cachedNow = Date.now();
    nowListeners.forEach((l) => l());
  }, 60_000);
}

function subscribeToNow(listener: () => void): () => void {
  ensureNowInterval();
  nowListeners.add(listener);
  return () => {
    nowListeners.delete(listener);
    if (nowListeners.size === 0 && nowInterval !== null) {
      clearInterval(nowInterval);
      nowInterval = null;
    }
  };
}

function getNowSnapshot(): number {
  if (cachedNow === 0) cachedNow = Date.now();
  return cachedNow;
}

function getNowServerSnapshot(): number {
  return 0;
}

function useDaysUntil(date: Date | string | null | undefined): number | null {
  const now = useSyncExternalStore(
    subscribeToNow,
    getNowSnapshot,
    getNowServerSnapshot
  );
  if (!date) return null;
  if (now === 0) return null;
  return Math.ceil((new Date(date).getTime() - now) / (1000 * 60 * 60 * 24));
}

export default function PlannerEventDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const f = useFormatters();
  const t = useTranslations("planner");
  const eventId = params.id as string;

  const initialTab = (searchParams.get("tab") as TabValue) || "overview";
  const [tab, setTab] = useState<TabValue>(
    TABS.includes(initialTab) ? initialTab : "overview"
  );

  const { data: event, isLoading, error } = trpc.events.byId.useQuery({
    id: eventId,
  });

  const daysUntil = useDaysUntil(event?.event_date ?? null);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-display text-2xl font-light tracking-tight">
          {t("eventNotFound")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button
          variant="outline"
          render={<Link href="/dashboard/planner/proposals" />}
          className="mt-6"
        >
          {t("backToProposals")}
        </Button>
      </div>
    );
  }

  if (isLoading || !event) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-6xl items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  const approvedDesign =
    event.designs.find((d) => d.approved_at) ?? event.designs[0] ?? null;
  const heroImage =
    approvedDesign?.media.find((m) => m.type === "render")?.url ??
    approvedDesign?.thumbnail ??
    null;
  const palette = normalizePalette(approvedDesign?.palette);
  const totalPaid = event.payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + decimalToNumber(p.amount), 0);
  const totalAll = event.payments.reduce(
    (sum, p) => sum + decimalToNumber(p.amount),
    0
  );
  const budget = decimalToNumber(event.budget);

  const onTabChange = (next: string) => {
    const v = next as TabValue;
    setTab(v);
    const url = new URL(window.location.href);
    if (v === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", v);
    window.history.replaceState({}, "", url);
  };

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="mb-8 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/dashboard/planner/proposals" />}
            className="-ms-2 gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
            {t("allProposals")}
          </Button>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
              statusStyles[event.status] ?? statusStyles.draft
            )}
          >
            <CircleDot className="me-1 size-2.5" />
            {event.status.replace("_", " ")}
          </span>
        </div>

        <header className="mb-10 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
              {event.event_type}
            </p>
            <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
              {event.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {event.event_date
                  ? f.date(event.event_date, "long")
                  : t("dateNotSet")}
              </span>
              {event.venue && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="size-4 shrink-0" />
                  <span className="truncate">{event.venue}</span>
                </span>
              )}
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <UserCircle className="size-4 shrink-0" />
                <span className="truncate">{event.client.full_name}</span>
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label={t("statDaysToGo")}
                value={
                  daysUntil == null
                    ? "—"
                    : daysUntil < 0
                      ? t("pastValue")
                      : `${daysUntil}`
                }
              />
              <Stat
                label={t("statBudget")}
                value={budget > 0 ? f.currency(budget) : "—"}
              />
              <Stat
                label={t("statPaid")}
                value={
                  totalAll > 0
                    ? `${Math.round((totalPaid / totalAll) * 100)}%`
                    : "—"
                }
                hint={
                  totalAll > 0
                    ? t("paidOfTotal", {
                        paid: f.currency(totalPaid),
                        total: f.currency(totalAll),
                      })
                    : undefined
                }
              />
            </div>
          </div>

          <div className="lg:col-span-5">
            <ApprovedDesignCard
              design={
                approvedDesign
                  ? {
                      id: approvedDesign.id,
                      name: approvedDesign.name,
                      thumbnail: approvedDesign.thumbnail,
                      palette: approvedDesign.palette,
                    }
                  : null
              }
              heroImage={heroImage}
              palette={palette}
            />
          </div>
        </header>

        <Tabs value={tab} onValueChange={onTabChange}>
          <TabsList className="mb-6 flex w-full flex-wrap gap-1 bg-rose-50/60 p-1 ring-1 ring-rose-100/70">
            <TabsTrigger value="overview" className="gap-1.5">
              <Sparkles className="size-3.5" />
              {t("tabOverview")}
            </TabsTrigger>
            <TabsTrigger value="design" className="gap-1.5">
              <Wand2 className="size-3.5" />
              {t("tabDesign")}
            </TabsTrigger>
            <TabsTrigger value="vendors" className="gap-1.5">
              <Users className="size-3.5" />
              {t("tabVendors")}
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <CreditCard className="size-3.5" />
              {t("tabPayments")}
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-1.5">
              <MessageSquare className="size-3.5" />
              {t("tabMessages")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab event={event} />
          </TabsContent>
          <TabsContent value="design">
            <DesignTab
              design={
                approvedDesign
                  ? {
                      id: approvedDesign.id,
                      name: approvedDesign.name,
                      thumbnail: approvedDesign.thumbnail,
                      palette: approvedDesign.palette,
                      references: approvedDesign.references,
                      media: approvedDesign.media,
                    }
                  : null
              }
            />
          </TabsContent>
          <TabsContent value="vendors">
            <VendorsTab event={event} />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsTab eventId={event.id} />
          </TabsContent>
          <TabsContent value="messages">
            <MessagesTab eventId={event.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-4 backdrop-blur-sm">
      <p className="text-[0.6rem] font-medium uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </p>
      <p className="font-display mt-1 text-2xl font-light leading-none tracking-tight">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ApprovedDesignCard({
  design,
  heroImage,
  palette,
}: {
  design: {
    id: string;
    name: string;
    thumbnail: string | null;
    palette: unknown;
  } | null;
  heroImage: string | null;
  palette: string[];
}) {
  const t = useTranslations("planner");
  if (!design) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 p-6 text-center backdrop-blur-sm">
        <Wand2 className="mb-3 size-6 text-rose-500" />
        <p className="font-display text-base font-medium tracking-tight">
          {t("noApprovedDesign")}
        </p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          {t("noApprovedDesignBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 ring-1 ring-foreground/[0.04] backdrop-blur-sm">
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt={design.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Sparkles className="size-7 text-rose-400/70" />
          </div>
        )}
        <div className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700 backdrop-blur-sm">
          <CheckCircle2 className="size-3" />
          {t("approvedDesign")}
        </div>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="font-display text-lg font-medium leading-tight tracking-tight">
          {design.name}
        </h3>
        {palette.length > 0 && (
          <div className="flex items-center gap-1">
            {palette.slice(0, 6).map((c) => (
              <span
                key={c}
                className="block size-3 rounded-full ring-1 ring-foreground/10"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface OverviewEventProps {
  id: string;
  title: string;
  event_type: string;
  event_date: Date | null;
  venue: string | null;
  budget: unknown;
  status: string;
  client: { full_name: string; avatar_url: string | null };
}

function OverviewTab({ event }: { event: OverviewEventProps }) {
  const f = useFormatters();
  const t = useTranslations("planner");
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3">
            <h3 className="font-display text-base font-medium tracking-tight">
              {t("eventDetails")}
            </h3>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("editedByCouple")}
            </span>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <DetailRow label={t("detailTitle")}>
              <p className="font-medium">{event.title}</p>
            </DetailRow>
            <DetailRow label={t("detailEventDate")}>
              <p className="font-medium">
                {event.event_date
                  ? f.date(event.event_date, "long")
                  : t("notSet")}
              </p>
            </DetailRow>
            <DetailRow label={t("detailVenueAddress")} className="sm:col-span-2">
              <p className="font-medium">
                {event.venue || (
                  <span className="text-muted-foreground">{t("notSet")}</span>
                )}
              </p>
            </DetailRow>
            <DetailRow label={t("detailBudgetEgp")}>
              <p className="font-medium">
                {decimalToNumber(event.budget) > 0
                  ? f.currency(decimalToNumber(event.budget))
                  : "—"}
              </p>
            </DetailRow>
            <DetailRow label={t("detailStatus")}>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
                  statusStyles[event.status] ?? statusStyles.draft
                )}
              >
                {event.status.replace("_", " ")}
              </span>
            </DetailRow>
          </div>
        </div>
      </div>

      <div className="lg:col-span-1">
        <div className="sticky top-24 overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
          <div className="border-b border-rose-100/70 px-5 py-3">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
              {t("theCouple")}
            </p>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              {event.client.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.client.avatar_url}
                  alt={event.client.full_name}
                  className="size-10 rounded-full object-cover ring-1 ring-rose-200"
                />
              ) : (
                <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-sm font-semibold text-rose-800">
                  {event.client.full_name.charAt(0)}
                </div>
              )}
              <div>
                <p className="text-sm font-medium">{event.client.full_name}</p>
                <p className="text-xs text-muted-foreground">{t("clientLabel")}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("useMessagesTabHint")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

interface DesignSnapshot {
  id: string;
  name: string;
  thumbnail: string | null;
  palette: unknown;
  references: unknown;
  media: Array<{
    id: string;
    url: string;
    type: string;
    parent_id: string | null;
  }>;
}

interface FlatRef {
  id: string;
  url: string;
  thumbnailUrl?: string;
}

function flattenReferences(value: unknown): FlatRef[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const out: FlatRef[] = [];
  for (const [category, refs] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (!Array.isArray(refs)) continue;
    for (const r of refs) {
      if (!r || typeof r !== "object") continue;
      const obj = r as Record<string, unknown>;
      const url = typeof obj.url === "string" ? obj.url : null;
      if (!url) continue;
      out.push({
        id: typeof obj.id === "string" ? obj.id : `${category}-${out.length}`,
        url,
        thumbnailUrl:
          typeof obj.thumbnailUrl === "string" ? obj.thumbnailUrl : undefined,
      });
    }
  }
  return out;
}

function DesignTab({ design }: { design: DesignSnapshot | null }) {
  const t = useTranslations("planner");
  if (!design) {
    return (
      <div className="rounded-2xl border border-dashed border-rose-200/70 bg-white/40 p-12 text-center">
        <p className="font-display text-lg font-light tracking-tight">
          {t("noApprovedDesignYetTitle")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("noApprovedDesignYetBody")}
        </p>
      </div>
    );
  }
  const palette = normalizePalette(design.palette);
  // The "selected" render is whichever one matches the design.thumbnail, with
  // a fallback to the most recent render. We need its id (not just the url)
  // so we can filter videos to only those generated from this render.
  const renders = design.media.filter((m) => m.type === "render");
  const selectedRender =
    (design.thumbnail
      ? renders.find((m) => m.url === design.thumbnail)
      : null) ??
    renders[0] ??
    null;
  const heroImage = selectedRender?.url ?? design.thumbnail ?? null;
  const refs = flattenReferences(design.references);
  // Videos linked (parent_id) to the selected render. Legacy videos with
  // parent_id === null only appear when the design has a single render
  // (safe assumption that the video came from it).
  const videos = design.media.filter((m) => {
    if (m.type !== "video") return false;
    if (selectedRender && m.parent_id === selectedRender.id) return true;
    if (m.parent_id === null && renders.length <= 1) return true;
    return false;
  });

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
        {heroImage && (
          <div className="relative aspect-[16/9] bg-gradient-to-br from-rose-50 to-amber-50/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage}
              alt={design.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="space-y-4 p-5">
          <h3 className="font-display text-xl font-light tracking-tight">
            {design.name}
          </h3>
          {palette.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {t("paletteHeading")}
              </p>
              <div className="flex flex-wrap gap-2">
                {palette.map((c) => (
                  <div
                    key={c}
                    className="flex items-center gap-2 rounded-full border border-rose-100/70 bg-white px-2 py-1 text-[11px]"
                  >
                    <span
                      className="block size-3 rounded-full ring-1 ring-foreground/10"
                      style={{ backgroundColor: c }}
                    />
                    <span className="font-mono text-muted-foreground">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {refs.length > 0 && (
        <div className="rounded-2xl border border-rose-100/70 bg-white/80 p-5 backdrop-blur-sm">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {t("referencesCount", { count: refs.length })}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {refs.map((r) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={r.id}
                src={r.thumbnailUrl ?? r.url}
                alt=""
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <div className="rounded-2xl border border-rose-100/70 bg-white/80 p-5 backdrop-blur-sm">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {t("cinematicPreview")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {videos.map((v) => (
              <video
                key={v.id}
                src={v.url}
                controls
                className="aspect-video w-full rounded-xl bg-black"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface VendorsTabEvent {
  id: string;
}

const ENGAGEMENT_STATUS_TONE: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  requested: "bg-rose-100 text-rose-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-stone-100 text-stone-700",
  active: "bg-amber-100 text-amber-900",
  completed: "bg-stone-100 text-stone-700",
  cancelled: "bg-stone-100 text-stone-500",
};

function VendorsTab({ event }: { event: VendorsTabEvent }) {
  const utils = trpc.useUtils();
  const f = useFormatters();
  const t = useTranslations("planner");
  const engagements = trpc.vendorEngagements.forEvent.useQuery({
    eventId: event.id,
  });
  const eventBalance = trpc.payouts.eventBalance.useQuery({
    eventId: event.id,
  });
  const walletBalance = trpc.payouts.plannerBalance.useQuery();
  const completeMutation = trpc.vendorEngagements.complete.useMutation({
    onSuccess: () => {
      toast.success(t("markedCompleteToast"));
      utils.vendorEngagements.forEvent.invalidate({ eventId: event.id });
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelMutation = trpc.vendorEngagements.cancel.useMutation({
    onSuccess: () => {
      toast.success(t("cancelledToast"));
      utils.vendorEngagements.forEvent.invalidate({ eventId: event.id });
    },
    onError: (e) => toast.error(e.message),
  });

  // Releases are gated server-side by the wallet-wide available, so we cap
  // the displayed "available for this event" by the wallet ceiling. Without
  // this the planner could see e.g. 30k for an event but only have 10k left
  // wallet-wide because of self-payouts already taken.
  const eventAvailable = eventBalance.data?.availableForEvent ?? 0;
  const walletAvailable = walletBalance.data?.availableNow ?? 0;
  const canReleaseHere = Math.min(eventAvailable, walletAvailable);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-100/70 bg-gradient-to-br from-rose-50 to-amber-50/60 px-5 py-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            {t("availableForEvent")}
          </p>
          <p className="font-display text-xl font-light leading-tight tracking-tight">
            {f.currency(canReleaseHere)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("earnedCommittedPaid", {
              accrued: f.currency(eventBalance.data?.accrued ?? 0),
              committed: f.currency(
                eventBalance.data?.committedToVendors ?? 0,
              ),
              paid: f.currency(eventBalance.data?.paidToVendors ?? 0),
            })}
            {walletAvailable < eventAvailable && (
              <>
                {" "}
                {t("walletWideCap", {
                  amount: f.currency(walletAvailable),
                })}
              </>
            )}
          </p>
        </div>
        <Button
          render={<Link href="/dashboard/planner/vendors" />}
          className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
        >
          <Plus className="size-4" />
          {t("addVendor")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3">
          <h3 className="font-display text-base font-medium tracking-tight">
            {t("engagementsHeading")}
          </h3>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("engagementsHint")}
          </span>
        </div>
        {engagements.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : (engagements.data?.length ?? 0) === 0 ? (
          <div className="px-5 py-12 text-center">
            <Users className="mx-auto mb-3 size-7 text-rose-500" />
            <p className="font-display text-lg font-light tracking-tight">
              {t("noVendorsYetTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noVendorsYetBody")}
            </p>
            <Button
              render={<Link href="/dashboard/planner/vendors" />}
              size="sm"
              className="mt-4 gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
            >
              {t("browseVendors")}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {engagements.data!.map((e) => (
              <EngagementRow
                key={e.id}
                engagement={e}
                onComplete={() => completeMutation.mutate({ id: e.id })}
                onCancel={() => {
                  const reason = prompt(t("cancelReasonPrompt"));
                  if (reason !== null) {
                    cancelMutation.mutate({
                      id: e.id,
                      reason: reason || undefined,
                    });
                  }
                }}
                pending={completeMutation.isPending || cancelMutation.isPending}
                eventId={event.id}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EngagementRow({
  engagement,
  onComplete,
  onCancel,
  pending,
  eventId,
}: {
  engagement: {
    id: string;
    title: string;
    notes: string | null;
    status: string;
    currency: string;
    total_amount: unknown;
    vendor: {
      id: string;
      business_name: string;
      category: string;
      avg_rating: unknown;
      review_count: number;
    };
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      quantity: number;
      unit_price: unknown;
      line_total: unknown;
      delivered_at: Date | string | null;
    }>;
    releases: Array<{
      id: string;
      label: string;
      amount: unknown;
      currency: string;
      status: string;
      requested_at: Date | string;
      paid_at: Date | string | null;
    }>;
  };
  onComplete: () => void;
  onCancel: () => void;
  pending: boolean;
  eventId: string;
}) {
  const utils = trpc.useUtils();
  const f = useFormatters();
  const t = useTranslations("planner");
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const totalReleased = engagement.releases
    .filter((r) => r.status === "paid" || r.status === "pending")
    .reduce((s, r) => s + Number(r.amount), 0);
  const remaining = decimalToNumber(engagement.total_amount) - totalReleased;
  const status = engagement.status;

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/dashboard/planner/vendors/${engagement.vendor.id}`}
            className="text-base font-medium leading-tight hover:underline"
          >
            {engagement.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {engagement.vendor.business_name} · {engagement.vendor.category}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
              ENGAGEMENT_STATUS_TONE[status] ?? ENGAGEMENT_STATUS_TONE.draft,
            )}
          >
            {status}
          </span>
          <span className="font-mono text-sm tabular-nums">
            {f.currency(
              decimalToNumber(engagement.total_amount),
              engagement.currency,
            )}
          </span>
        </div>
      </div>
      {engagement.notes && (
        <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-700">
          {engagement.notes}
        </p>
      )}

      <ul className="divide-y divide-rose-100/70 rounded-xl border border-rose-100/70 text-sm">
        {engagement.items.map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate">{i.name}</p>
              {i.description && (
                <p className="truncate text-xs text-muted-foreground">
                  {i.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              <span>×{i.quantity}</span>
              {i.delivered_at && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-100">
                  {t("deliveredBadge")}
                </span>
              )}
              <span className="font-mono tabular-nums">
                {f.currency(
                  decimalToNumber(i.line_total),
                  engagement.currency,
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {engagement.releases.length > 0 && (
        <div className="rounded-xl border border-rose-100/70">
          <p className="border-b border-rose-100/70 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
            {t("releasesRemaining", {
              amount: f.currency(
                Math.max(0, remaining),
                engagement.currency,
              ),
            })}
          </p>
          <ul className="divide-y divide-rose-100/70 text-sm">
            {engagement.releases.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div>
                  <p className="font-medium">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("requestedOnLabel", {
                      date: f.date(r.requested_at, "medium"),
                    })}
                    {r.paid_at && (
                      <>
                        {" "}
                        ·{" "}
                        {t("paidOnLabel", {
                          date: f.date(r.paid_at, "medium"),
                        })}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                      r.status === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : r.status === "cancelled"
                          ? "bg-stone-100 text-stone-500"
                          : "bg-amber-100 text-amber-900",
                    )}
                  >
                    {r.status}
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {f.currency(
                      decimalToNumber(r.amount),
                      r.currency,
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {(status === "accepted" || status === "active" || status === "completed") && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReleaseOpen(true)}
            disabled={pending}
            className="gap-1"
          >
            <Plus className="size-3.5" />
            {t("releaseFunds")}
          </Button>
        )}
        {(status === "accepted" || status === "active") && (
          <Button
            size="sm"
            variant="outline"
            onClick={onComplete}
            disabled={pending}
            className="gap-1"
          >
            <CheckCircle2 className="size-3.5" />
            {t("markComplete")}
          </Button>
        )}
        {status === "completed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReviewOpen(true)}
            className="gap-1"
          >
            <Sparkles className="size-3.5" />
            {t("leaveReview")}
          </Button>
        )}
        {(status === "requested" || status === "accepted" || status === "active") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
            className="gap-1 text-destructive"
          >
            <Trash2 className="size-3.5" />
            {t("cancelAction")}
          </Button>
        )}
      </div>

      <ReleaseDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        engagementId={engagement.id}
        currency={engagement.currency}
        onCreated={() => {
          utils.vendorEngagements.forEvent.invalidate({ eventId });
          utils.payouts.plannerBalance.invalidate();
        }}
      />
      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        engagementId={engagement.id}
        vendorId={engagement.vendor.id}
        vendorName={engagement.vendor.business_name}
      />
    </li>
  );
}

function ReleaseDialog({
  open,
  onOpenChange,
  engagementId,
  currency,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  engagementId: string;
  currency: string;
  onCreated: () => void;
}) {
  const t = useTranslations("planner");
  const [label, setLabel] = useState(t("depositDefault"));
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const create = trpc.vendorReleases.create.useMutation({
    onSuccess: () => {
      toast.success(t("releaseQueuedToast"));
      onCreated();
      onOpenChange(false);
      setLabel(t("depositDefault"));
      setAmount("");
      setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("releaseFunds")}</DialogTitle>
          <DialogDescription>
            {t("releaseFundsDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rl-label">{t("releaseLabel")}</Label>
            <Input
              id="rl-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rl-amt">
              {t("releaseAmountLabel", { currency })}
            </Label>
            <Input
              id="rl-amt"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rl-notes">{t("releaseNotesLabel")}</Label>
            <Textarea
              id="rl-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            disabled={create.isPending}
            onClick={() => {
              const n = Number(amount);
              if (!Number.isFinite(n) || n <= 0) {
                toast.error(t("amountMustBePositiveError"));
                return;
              }
              create.mutate({
                engagement_id: engagementId,
                label: label.trim() || t("releaseDefault"),
                amount: n,
                notes: notes.trim() || null,
              });
            }}
            className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("queueRelease")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  open,
  onOpenChange,
  engagementId,
  vendorId,
  vendorName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  engagementId: string;
  vendorId: string;
  vendorName: string;
}) {
  const t = useTranslations("planner");
  const utils = trpc.useUtils();
  const existing = trpc.vendorReviews.mineForEngagement.useQuery(
    { engagementId, vendorId },
    { enabled: open },
  );
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const seed = existing.data?.id ?? null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (open && seed !== seededFor) {
    setSeededFor(seed);
    setRating(existing.data?.rating ?? 5);
    setComment(existing.data?.comment ?? "");
  }

  const upsert = trpc.vendorReviews.upsert.useMutation({
    onSuccess: () => {
      toast.success(t("reviewSavedToast"));
      utils.vendorReviews.forVendor.invalidate({ vendorId });
      utils.vendorReviews.mineForEngagement.invalidate({
        engagementId,
        vendorId,
      });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reviewVendor", { name: vendorName })}</DialogTitle>
          <DialogDescription>
            {t("reviewVendorDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("ratingLabel")}</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={cn(
                    "text-2xl",
                    n <= rating ? "text-amber-500" : "text-stone-300",
                  )}
                  aria-label={t("starsAriaLabel", { n })}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rv-cmt">{t("commentOptionalLabel")}</Label>
            <Textarea
              id="rv-cmt"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={upsert.isPending}
            onClick={() =>
              upsert.mutate({
                engagementId,
                vendorId,
                rating,
                comment: comment.trim() || undefined,
              })
            }
            className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
          >
            {upsert.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("saveReview")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsTab({ eventId }: { eventId: string }) {
  return (
    <div className="space-y-6">
      <SchedulePanel eventId={eventId} side="planner" />
    </div>
  );
}

function MessagesTab({ eventId }: { eventId: string }) {
  const utils = trpc.useUtils();
  const t = useTranslations("planner");
  const f = useFormatters();
  const { data: profile } = trpc.profile.me.useQuery();
  // Realtime sync invalidates the query on INSERT; the long refetchInterval
  // is just a safety net in case the websocket drops without firing the
  // subscription callback (e.g. tab backgrounded for hours).
  useRealtimeMessageSync(eventId);
  const { data: messages, isLoading } = trpc.messages.byEvent.useQuery(
    { eventId },
    { refetchInterval: 60_000 }
  );

  const [content, setContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  const send = trpc.messages.send.useMutation({
    onSuccess: () => {
      setContent("");
      utils.messages.byEvent.invalidate({ eventId });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSend = () => {
    if (!content.trim()) return;
    send.mutate({ eventId, content: content.trim() });
  };

  return (
    <div className="flex min-h-[60dvh] flex-col overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
      <div className="border-b border-rose-100/70 px-5 py-3">
        <h3 className="font-display text-base font-medium tracking-tight">
          {t("messagesTitle")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("talkWithCoupleHint")}
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare className="mb-3 size-7 text-rose-500" />
            <p className="font-display text-base font-medium tracking-tight">
              {t("sayHelloTitle")}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {t("sayHelloBody")}
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_id === profile?.id;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex gap-2",
                  isMine ? "flex-row-reverse" : "flex-row"
                )}
              >
                {!isMine && (
                  <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-[11px] font-semibold text-rose-800">
                    {m.sender.full_name.charAt(0)}
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                    isMine
                      ? "bg-gradient-to-br from-rose-600 to-amber-500 text-white"
                      : "bg-rose-50/80 text-foreground ring-1 ring-rose-100"
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px]",
                      isMine ? "text-white/70" : "text-muted-foreground"
                    )}
                  >
                    {!isMine && `${m.sender.full_name} · `}
                    {f.relativeTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-rose-100/70 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder={t("writeMessagePlaceholder")}
            className="min-h-9 resize-none"
          />
          <Button
            size="icon"
            disabled={send.isPending || !content.trim()}
            onClick={handleSend}
            className="size-9 shrink-0 bg-gradient-to-br from-rose-600 to-amber-500 text-white hover:opacity-90"
          >
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
