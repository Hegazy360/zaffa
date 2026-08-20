"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDot,
  CreditCard,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  Send,
  Sparkles,
  Star,
  Trash2,
  UserCircle,
  Wand2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EventStatus } from "@/types";
import { SchedulePanel } from "@/components/payments/SchedulePanel";
import { useRealtimeMessageSync } from "@/hooks/use-realtime-messages";
import { RecommendedVenuesCard } from "./_components/recommended-venues-card";
import { ConciergePackageCard } from "./_components/concierge-package-card";

import { useFormatters } from "@/lib/use-formatters";
import { useConfirm } from "@/components/ui/confirm";
const TABS = [
  "overview",
  "design",
  "proposals",
  "payments",
  "messages",
] as const;
type TabValue = (typeof TABS)[number];

type ClientStatusKey =
  | "statusDraft"
  | "statusPlanning"
  | "statusConfirmed"
  | "statusInProgress"
  | "statusCompleted"
  | "statusCancelled";

const STATUS_KEYS: Record<EventStatus, ClientStatusKey> = {
  draft: "statusDraft",
  planning: "statusPlanning",
  confirmed: "statusConfirmed",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
};

function statusLabelKey(status: string): ClientStatusKey {
  return STATUS_KEYS[status as EventStatus] ?? "statusDraft";
}

const STATUS_VALUES: EventStatus[] = [
  "draft",
  "planning",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
];

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
  // Prisma Decimal serializes via superjson — convert via toString.
  if (typeof value === "object" && "toString" in (value as object)) {
    return parseFloat((value as { toString(): string }).toString()) || 0;
  }
  return 0;
}

export default function EventDetailPage() {
  const params = useParams();
  const f = useFormatters();
  const tc = useTranslations("client");
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params.id as string;

  const initialTab = (searchParams.get("tab") as TabValue) || "overview";
  const [tab, setTab] = useState<TabValue>(
    TABS.includes(initialTab) ? initialTab : "overview"
  );

  const utils = trpc.useUtils();
  const { data: event, isLoading, error } = trpc.events.byId.useQuery({
    id: eventId,
  });

  // Hooks must be called unconditionally — pull the days-until value before
  // any early returns. The hook is null-tolerant so it's safe pre-load.
  const daysUntil = useDaysUntil(event?.event_date ?? null);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-display text-2xl font-light tracking-tight">
          {tc("eventNotFound")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message}
        </p>
        <Button
          variant="outline"
          render={<Link href="/dashboard/client" />}
          className="mt-6"
        >
          {tc("backToDashboard")}
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
  // Prefer the render whose URL matches design.thumbnail (the one the couple
  // explicitly selected). Fall back to the latest render, then the raw
  // thumbnail field for very old designs.
  const heroImage =
    (approvedDesign?.thumbnail
      ? approvedDesign.media.find(
          (m) => m.type === "render" && m.url === approvedDesign.thumbnail
        )?.url
      : null) ??
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
        {/* Back + status */}
        <div className="mb-8 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/dashboard/client" />}
            className="-ms-2 gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
            {tc("allEvents")}
          </Button>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ring-1",
              statusStyles[event.status] ?? statusStyles.draft
            )}
          >
            <CircleDot className="me-1 size-2.5" />
            {tc(statusLabelKey(event.status))}
          </span>
        </div>

        {/* Hero */}
        <header className="mb-10 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="mb-2 text-eyebrow font-medium text-rose-700/80">
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
                  : tc("dateNotSet")}
              </span>
              {event.venue && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="size-4 shrink-0" />
                  <span className="truncate">{event.venue}</span>
                </span>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label={tc("daysToGo")}
                value={
                  daysUntil == null
                    ? "—"
                    : daysUntil < 0
                      ? tc("past")
                      : `${daysUntil}`
                }
              />
              <Stat
                label={tc("budget")}
                value={budget > 0 ? f.currency(budget) : "—"}
              />
              <Stat
                label={tc("paid")}
                value={
                  totalAll > 0
                    ? `${Math.round((totalPaid / totalAll) * 100)}%`
                    : "—"
                }
                hint={
                  totalAll > 0
                    ? tc("paidOfTotal", {
                        paid: f.currency(totalPaid),
                        total: f.currency(totalAll),
                      })
                    : undefined
                }
              />
            </div>
          </div>

          {/* Approved design preview */}
          <div className="lg:col-span-5">
            <ApprovedDesignCard
              design={approvedDesign}
              heroImage={heroImage}
              palette={palette}
            />
          </div>
        </header>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={onTabChange}>
          <TabsList className="mb-6 flex w-full justify-start snap-x scroll-px-1 gap-1 overflow-x-auto bg-rose-50/60 p-1 ring-1 ring-rose-100/70 sm:justify-center sm:overflow-visible">
            <TabsTrigger value="overview" className="shrink-0 snap-start gap-1.5 px-3 sm:flex-1 sm:px-1.5">
              <Sparkles className="size-3.5" />
              {tc("tabOverview")}
            </TabsTrigger>
            <TabsTrigger value="design" className="shrink-0 snap-start gap-1.5 px-3 sm:flex-1 sm:px-1.5">
              <Wand2 className="size-3.5" />
              {tc("tabDesign")}
            </TabsTrigger>
            <TabsTrigger value="proposals" className="shrink-0 snap-start gap-1.5 px-3 sm:flex-1 sm:px-1.5">
              <FileText className="size-3.5" />
              {tc("tabProposals")}
            </TabsTrigger>
            <TabsTrigger value="payments" className="shrink-0 snap-start gap-1.5 px-3 sm:flex-1 sm:px-1.5">
              <CreditCard className="size-3.5" />
              {tc("tabPayments")}
            </TabsTrigger>
            <TabsTrigger value="messages" className="shrink-0 snap-start gap-1.5 px-3 sm:flex-1 sm:px-1.5">
              <MessageSquare className="size-3.5" />
              {tc("tabMessages")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              event={event}
              onSaved={() => utils.events.byId.invalidate({ id: eventId })}
              onDelete={() => router.push("/dashboard/client")}
            />
          </TabsContent>

          <TabsContent value="design">
            <DesignTab
              event={event}
              approvedDesign={approvedDesign}
              onAttached={() => utils.events.byId.invalidate({ id: eventId })}
            />
          </TabsContent>

          <TabsContent value="proposals">
            <ProposalsTab
              eventId={event.id}
              currentPlannerId={event.planner?.id ?? null}
            />
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

// "now" subscribed via useSyncExternalStore so the component stays pure
// across renders (no Date.now() in render, no setState in effect).
//
// CRITICAL: getSnapshot must return the SAME value across calls within a
// single render — otherwise React treats it as a constantly-changing store
// and infinite-loops. We cache the value in a module-level state and only
// refresh it from the subscriber's interval (every minute, plenty for a
// day-granularity countdown).
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
  return Math.ceil(
    (new Date(date).getTime() - now) / (1000 * 60 * 60 * 24)
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
    <div className="rounded-2xl border border-brand-line bg-white/70 p-4 backdrop-blur-sm">
      <p className="text-eyebrow font-medium text-muted-foreground">
        {label}
      </p>
      <p className="font-display mt-1 text-2xl font-light leading-none tracking-tight">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approved design card (above the tabs) — anchors the page to the visual
// agreement: this is the room we're building.
// ---------------------------------------------------------------------------

interface DesignSnapshot {
  id: string;
  name: string;
  thumbnail: string | null;
  palette: unknown;
  approved_at: Date | null;
  media: Array<{
    id: string;
    type: string;
    url: string;
    parent_id: string | null;
  }>;
}

function ApprovedDesignCard({
  design,
  heroImage,
  palette,
}: {
  design: DesignSnapshot | null;
  heroImage: string | null;
  palette: string[];
}) {
  const tc = useTranslations("client");
  if (!design) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 p-6 text-center backdrop-blur-sm">
        <Wand2 className="mb-3 size-6 text-rose-500" />
        <p className="font-display text-base font-medium tracking-tight">
          {tc("noDesignAttached")}
        </p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          {tc("noDesignAttachedHint")}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/venue-designer/${design.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-brand-line bg-white/80 ring-1 ring-foreground/[0.04] backdrop-blur-sm transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt={design.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Sparkles className="size-7 text-rose-400/70" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        <div className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-rose-700 backdrop-blur-sm">
          <CheckCircle2 className="size-3" />
          {tc("approvedDesign")}
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
        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          {tc("openInVenueDesigner")}
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
        </p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Overview tab — editable event basics
// ---------------------------------------------------------------------------

interface OverviewEvent {
  id: string;
  title: string;
  event_type: string;
  event_date: Date | null;
  venue: string | null;
  budget: unknown;
  status: string;
  planner: {
    business_name: string;
    location: string | null;
    profile: { full_name: string; avatar_url: string | null };
  } | null;
  // Latest VisionPack stamped onto this event. Used to gate
  // tier-specific UI (e.g. the venue recommendations card).
  vision_packs: { id: string; sku: string; status: string }[];
}

function OverviewTab({
  event,
  onSaved,
  onDelete,
}: {
  event: OverviewEvent;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const f = useFormatters();
  const tc = useTranslations("client");
  const tCommon = useTranslations("common");
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [eventDate, setEventDate] = useState(
    event.event_date ? format(new Date(event.event_date), "yyyy-MM-dd") : ""
  );
  const [venue, setVenue] = useState(event.venue ?? "");
  const [budget, setBudget] = useState(
    event.budget ? decimalToNumber(event.budget).toString() : ""
  );
  const [status, setStatus] = useState<EventStatus>(event.status as EventStatus);

  const update = trpc.events.update.useMutation({
    onSuccess: () => {
      toast.success(tc("eventUpdatedToast"));
      setEditing(false);
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = trpc.events.delete.useMutation({
    onSuccess: () => {
      toast.success(tc("eventDeletedToast"));
      onDelete();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    update.mutate({
      id: event.id,
      title,
      event_date: eventDate ? new Date(eventDate) : null,
      venue: venue.trim() || null,
      budget: budget ? parseFloat(budget) : null,
      status,
    });
  };

  // Pull the most-recent Vision Pack stamped onto this event so the
  // recommendations card knows whether to render. Coming from
  // events.byId via the new `vision_packs` include.
  const latestPackSku = event.vision_packs?.[0]?.sku ?? null;

  return (
    <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Details */}
      <div className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-brand-line px-5 py-3">
            <h3 className="font-display text-base font-medium tracking-tight">
              {tc("eventDetails")}
            </h3>
            {!editing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                className="h-8 gap-1 text-xs"
              >
                <Pencil className="size-3" />
                {tc("edit")}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setTitle(event.title);
                    setEventDate(
                      event.event_date
                        ? format(new Date(event.event_date), "yyyy-MM-dd")
                        : ""
                    );
                    setVenue(event.venue ?? "");
                    setBudget(
                      event.budget
                        ? decimalToNumber(event.budget).toString()
                        : ""
                    );
                    setStatus(event.status as EventStatus);
                  }}
                  className="h-8 text-xs"
                >
                  {tc("cancel")}
                </Button>
                <Button
                  size="sm"
                  disabled={update.isPending}
                  onClick={handleSave}
                  className="h-8 gap-1 bg-brand-gradient text-xs text-white hover:opacity-90"
                >
                  {update.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  {tc("save")}
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <DetailRow label={tc("title")}>
              {editing ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              ) : (
                <p className="font-medium">{event.title}</p>
              )}
            </DetailRow>

            <DetailRow label={tc("eventDate")}>
              {editing ? (
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              ) : (
                <p className="font-medium">
                  {event.event_date
                    ? f.date(event.event_date, "long")
                    : tc("notSet")}
                </p>
              )}
            </DetailRow>

            <DetailRow label={tc("venueAddress")} className="sm:col-span-2">
              {editing ? (
                <Input
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder={tc("venuePlaceholder")}
                />
              ) : (
                <p className="font-medium">
                  {event.venue || (
                    <span className="text-muted-foreground">{tc("notSet")}</span>
                  )}
                </p>
              )}
            </DetailRow>

            <DetailRow label={tc("budgetEgp")}>
              {editing ? (
                <Input
                  type="number"
                  inputMode="numeric"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="0"
                />
              ) : (
                <p className="font-medium">
                  {decimalToNumber(event.budget) > 0
                    ? f.currency(decimalToNumber(event.budget))
                    : "—"}
                </p>
              )}
            </DetailRow>

            <DetailRow label={tc("status")}>
              {editing ? (
                <Select
                  items={STATUS_VALUES.map((v) => ({
                    value: v,
                    label: tc(STATUS_KEYS[v]),
                  }))}
                  value={status}
                  onValueChange={(v) => v && setStatus(v as EventStatus)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {tc(STATUS_KEYS[v])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1",
                    statusStyles[event.status] ?? statusStyles.draft
                  )}
                >
                  {tc(statusLabelKey(event.status))}
                </span>
              )}
            </DetailRow>
          </div>
        </div>

        {/* Danger zone */}
        <div className="mt-6 rounded-2xl border border-stone-200/70 bg-stone-50/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{tc("deleteEvent")}</p>
              <p className="text-xs text-muted-foreground">
                {tc("deleteEventBody")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={remove.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: tc("deleteConfirm", { title: event.title }),
                    description: tCommon("areYouSure"),
                    confirmLabel: tCommon("delete"),
                    destructive: true,
                  })
                ) {
                  remove.mutate({ id: event.id });
                }
              }}
              className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              {tc("delete")}
            </Button>
          </div>
        </div>
      </div>

      {/* Planner sidebar */}
      <div className="lg:col-span-1">
        <div className="sticky top-24 overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
          <div className="border-b border-brand-line px-5 py-3">
            <p className="text-eyebrow font-medium text-rose-700/80">
              {tc("yourPlanner")}
            </p>
          </div>
          {event.planner ? (
            <div className="space-y-3 p-5">
              <div className="flex items-center gap-3">
                {event.planner.profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.planner.profile.avatar_url}
                    alt={event.planner.profile.full_name}
                    className="size-12 rounded-full object-cover ring-1 ring-rose-200/60"
                  />
                ) : (
                  <div className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-base font-semibold text-rose-800">
                    {event.planner.profile.full_name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="font-display text-base font-medium leading-tight tracking-tight">
                    {event.planner.business_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.planner.profile.full_name}
                  </p>
                </div>
              </div>
              {event.planner.location && (
                <p className="text-xs text-muted-foreground">
                  <MapPin className="me-1 inline size-3" />
                  {event.planner.location}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2 p-5 text-center">
              <p className="text-sm text-muted-foreground">
                {tc("noPlannerYet")}
              </p>
              <p className="text-xs text-muted-foreground">
                {tc("noPlannerYetHint")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Renders only when a concierge quote exists, so it can sit here
          unconditionally for every client. */}
      <ConciergePackageCard eventId={event.id} />
      <RecommendedVenuesCard eventId={event.id} packSku={latestPackSku} />
    </div>
  );
}

function DetailRow({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-eyebrow font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Design tab — switch which design is "the approved one"
// ---------------------------------------------------------------------------

function DesignTab({
  event,
  approvedDesign,
  onAttached,
}: {
  event: { id: string; designs: DesignSnapshot[] };
  approvedDesign: DesignSnapshot | null;
  onAttached: () => void;
}) {
  const tc = useTranslations("client");
  const f = useFormatters();
  const { data: allDesigns } = trpc.venueDesigns.list.useQuery();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const attach = trpc.events.attachDesign.useMutation({
    onSuccess: () => {
      toast.success(tc("designAttachedToast"));
      setOpen(false);
      onAttached();
      utils.venueDesigns.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Designs that aren't already attached to this event
  const candidates = useMemo(() => {
    if (!allDesigns) return [];
    const attachedIds = new Set(event.designs.map((d) => d.id));
    return allDesigns.filter((d) => !attachedIds.has(d.id));
  }, [allDesigns, event.designs]);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-brand-line px-5 py-3">
          <h3 className="font-display text-base font-medium tracking-tight">
            {tc("designWeAreBuilding")}
          </h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                />
              }
            >
              <Wand2 className="size-3" />
              {tc("swapDesign")}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{tc("swapApprovedDesign")}</DialogTitle>
                <DialogDescription>
                  {tc("swapApprovedDesignDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {tc("noOtherDesigns")}
                  </p>
                ) : (
                  candidates.map((d) => {
                    const img = d.media[0]?.url ?? d.thumbnail ?? null;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        disabled={attach.isPending}
                        onClick={() =>
                          attach.mutate({
                            eventId: event.id,
                            designId: d.id,
                          })
                        }
                        className="flex w-full items-center gap-3 rounded-xl border border-brand-line bg-white/60 p-2.5 text-start transition-all hover:bg-rose-50/60 disabled:opacity-50"
                      >
                        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={img}
                              alt={d.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full place-items-center">
                              <ImageIcon className="size-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {d.name}
                          </p>
                          <p className="text-xs capitalize text-muted-foreground">
                            {d.event_type} · {d.size} · {d.setting}
                          </p>
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground rtl:-scale-x-100" />
                      </button>
                    );
                  })
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {approvedDesign ? (
          <div className="grid gap-6 p-5 md:grid-cols-2">
            <Link
              href={`/venue-designer/${approvedDesign.id}`}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted"
            >
              {approvedDesign.media.find((m) => m.type === "render")?.url ||
              approvedDesign.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    approvedDesign.media.find((m) => m.type === "render")
                      ?.url ??
                    approvedDesign.thumbnail ??
                    ""
                  }
                  alt={approvedDesign.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Sparkles className="size-8 text-rose-400/70" />
                </div>
              )}
            </Link>
            <div className="space-y-3">
              <div>
                <p className="font-display text-xl font-medium leading-tight tracking-tight">
                  {approvedDesign.name}
                </p>
                {approvedDesign.approved_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tc("approvedRelative", {
                      when: f.relativeTime(approvedDesign.approved_at),
                    })}
                  </p>
                )}
              </div>
              {normalizePalette(approvedDesign.palette).length > 0 && (
                <div>
                  <p className="text-eyebrow font-medium text-muted-foreground">
                    {tc("palette")}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {normalizePalette(approvedDesign.palette)
                      .slice(0, 6)
                      .map((c) => (
                        <span
                          key={c}
                          className="block size-5 rounded-full ring-1 ring-foreground/10"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                  </div>
                </div>
              )}
              <Button
                size="sm"
                render={<Link href={`/venue-designer/${approvedDesign.id}`} />}
                className="gap-1 bg-brand-gradient text-white hover:opacity-90"
              >
                {tc("openInVenueDesigner")}
                <ArrowRight className="size-3.5 rtl:-scale-x-100" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <Wand2 className="mx-auto mb-3 size-7 text-rose-500" />
            <p className="font-display text-lg font-light tracking-tight">
              {tc("noDesignAttachedYet")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tc("useSwapHint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments tab — totals, list, add, mark paid
// ---------------------------------------------------------------------------

function PaymentsTab({ eventId }: { eventId: string }) {
  const tc = useTranslations("client");
  const searchParams = useSearchParams();

  // Stripe Checkout returns to this page with ?paid=<installmentId>. We
  // pass it down so the SchedulePanel can poll until the webhook flips it.
  const paid = searchParams.get("paid");
  const cancelled = searchParams.get("cancelled");

  useEffect(() => {
    if (paid) {
      toast.success(tc("thanksConfirmingPayment"));
    } else if (cancelled) {
      toast.message(tc("checkoutCancelled"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <SchedulePanel eventId={eventId} side="client" paidQueryParam={paid} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages tab
// ---------------------------------------------------------------------------

function MessagesTab({ eventId }: { eventId: string }) {
  const tc = useTranslations("client");
  const f = useFormatters();
  const utils = trpc.useUtils();
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

  // Pin to bottom on new messages.
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
    <div className="flex min-h-[60dvh] flex-col overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
      <div className="border-b border-brand-line px-5 py-3">
        <h3 className="font-display text-base font-medium tracking-tight">
          {tc("messagesTab")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {tc("messagesIntro")}
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
              {tc("sayHello")}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {tc("sayHelloHint")}
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
                  <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-xs font-semibold text-rose-800">
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
                      "mt-1 text-xs",
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

      <div className="border-t border-brand-line p-3">
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
            placeholder={tc("writeMessagePlaceholder")}
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

// ---------------------------------------------------------------------------
// Proposals tab — list + accept + switch planner
// ---------------------------------------------------------------------------

interface ProposalForClient {
  id: string;
  status: string;
  cover_letter: string;
  quote_amount: unknown;
  quote_currency: string;
  quote_breakdown: unknown;
  release_reason: string | null;
  release_rating: number | null;
  planner: {
    id: string;
    business_name: string;
    bio: string | null;
    location: string | null;
    specialties: unknown;
    avg_rating: unknown;
    review_count: number;
    verified: boolean;
    profile: { full_name: string; avatar_url: string | null };
    portfolio_items: Array<{
      id: string;
      image_url: string;
      caption: string | null;
    }>;
    reviews: Array<{
      id: string;
      rating: number;
      comment: string | null;
      author: { full_name: string };
    }>;
  };
}

function ProposalsTab({
  eventId,
  currentPlannerId,
}: {
  eventId: string;
  currentPlannerId: string | null;
}) {
  const tc = useTranslations("client");
  const utils = trpc.useUtils();
  const { data: proposals, isLoading } = trpc.proposals.byEvent.useQuery({
    eventId,
  });

  // Couple-journey funnel — fired the first time a proposal becomes
  // visible to the client for this event in this session. The mirror
  // server-side `proposal.sent` is captured in proposals.create, so the
  // funnel "sent → received" measures the gap.
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!proposals || proposals.length === 0) return;
    if (announcedRef.current === eventId) return;
    announcedRef.current = eventId;
    track(ANALYTICS_EVENTS.PROPOSAL_RECEIVED, {
      event_id: eventId,
      proposal_count: proposals.length,
    });
  }, [eventId, proposals]);

  const accept = trpc.proposals.accept.useMutation({
    onSuccess: () => {
      toast.success(tc("plannerAcceptedToast"));
      utils.proposals.byEvent.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [switchOpen, setSwitchOpen] = useState<{
    fromProposalId: string;
    toProposalId: string;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!proposals || proposals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-rose-200/70 bg-white/40 p-12 text-center backdrop-blur-sm">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
          <FileText className="size-5 text-rose-600" />
        </div>
        <p className="font-display text-lg font-light tracking-tight">
          {tc("noProposalsYet")}
        </p>
        <p className="mt-1 max-w-md mx-auto text-sm text-muted-foreground">
          {tc("noProposalsBody")}
        </p>
      </div>
    );
  }

  const accepted = proposals.find((p) => p.status === "accepted") ?? null;
  const pending = proposals.filter((p) => p.status === "pending");
  const released = proposals.filter((p) => p.status === "released");
  const declined = proposals.filter((p) => p.status === "declined");

  return (
    <div className="space-y-8">
      {accepted && (
        <section>
          <p className="mb-3 text-eyebrow font-medium text-rose-700/80">
            {tc("currentlyEngaged")}
          </p>
          <ProposalCard
            proposal={accepted}
            eventId={eventId}
            currentPlannerId={currentPlannerId}
            onAccept={() => {}}
            onSwitch={() => {}}
            isAccepting={false}
          />
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <p className="mb-3 text-eyebrow font-medium text-rose-700/80">
            {accepted ? tc("backupsStandingBy") : tc("awaitingDecision")}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pending.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                eventId={eventId}
                currentPlannerId={currentPlannerId}
                onAccept={() => accept.mutate({ proposalId: p.id })}
                onSwitch={() => {
                  if (!accepted) return;
                  setSwitchOpen({
                    fromProposalId: accepted.id,
                    toProposalId: p.id,
                  });
                }}
                isAccepting={
                  accept.isPending && accept.variables?.proposalId === p.id
                }
              />
            ))}
          </div>
        </section>
      )}

      {released.length > 0 && (
        <section>
          <p className="mb-3 text-eyebrow font-medium text-stone-500">
            {tc("pastPlanners")}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {released.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                eventId={eventId}
                currentPlannerId={currentPlannerId}
                onAccept={() => {}}
                onSwitch={() => {}}
                isAccepting={false}
              />
            ))}
          </div>
        </section>
      )}

      {declined.length > 0 && (
        <section>
          <p className="mb-3 text-eyebrow font-medium text-stone-500">
            {tc("withdrew")}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {declined.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                eventId={eventId}
                currentPlannerId={currentPlannerId}
                onAccept={() => {}}
                onSwitch={() => {}}
                isAccepting={false}
              />
            ))}
          </div>
        </section>
      )}

      <Dialog
        open={switchOpen !== null}
        onOpenChange={(o) => !o && setSwitchOpen(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-light tracking-tight">
              {tc("switchPlanners")}
            </DialogTitle>
            <DialogDescription>
              {tc("switchPlannersDesc")}
            </DialogDescription>
          </DialogHeader>
          {switchOpen && (
            <SwitchPlannerForm
              fromProposalId={switchOpen.fromProposalId}
              toProposalId={switchOpen.toProposalId}
              onDone={() => {
                setSwitchOpen(null);
                utils.proposals.byEvent.invalidate({ eventId });
                utils.events.byId.invalidate({ id: eventId });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProposalCard({
  proposal,
  eventId,
  currentPlannerId,
  onAccept,
  onSwitch,
  isAccepting,
}: {
  proposal: ProposalForClient;
  eventId: string;
  currentPlannerId: string | null;
  onAccept: () => void;
  onSwitch: () => void;
  isAccepting: boolean;
}) {
  const utils = trpc.useUtils();
  const f = useFormatters();
  const tc = useTranslations("client");
  const amount = decimalToNumber(proposal.quote_amount);
  const rating = decimalToNumber(proposal.planner.avg_rating);
  const isAccepted = proposal.status === "accepted";
  const isReleased = proposal.status === "released";
  const isDeclined = proposal.status === "declined";
  const someoneEngaged = currentPlannerId !== null;
  const isPending = proposal.status === "pending";
  const canReview = isAccepted || isReleased;
  const planner = proposal.planner;

  // Pull the payment schedule attached to *this* proposal (if any). When the
  // schedule is still "proposed", the accept flow rolls both proposal +
  // schedule into a single transaction via paymentSchedules.acceptProposed.
  const { data: scheduleForEvent } =
    trpc.paymentSchedules.forEvent.useQuery(
      { eventId },
      { enabled: isPending }
    );
  const proposedSchedule =
    scheduleForEvent && scheduleForEvent.proposal_id === proposal.id
      ? scheduleForEvent
      : null;
  const acceptSchedule = trpc.paymentSchedules.acceptProposed.useMutation({
    onSuccess: () => {
      toast.success(tc("plannerAcceptedToast"));
      utils.proposals.byEvent.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
      utils.paymentSchedules.forEvent.invalidate({ eventId });
    },
    onError: (e) => toast.error(e.message),
  });
  const acceptingSchedule = acceptSchedule.isPending;
  const specialtiesArr = Array.isArray(planner.specialties)
    ? (planner.specialties as unknown[]).filter(
        (s): s is string => typeof s === "string"
      )
    : [];

  return (
    <article className="rounded-2xl border border-brand-line bg-white/80 p-5 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        {planner.profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={planner.profile.avatar_url}
            alt={planner.business_name}
            className="size-12 shrink-0 rounded-full object-cover ring-1 ring-rose-200"
          />
        ) : (
          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-sm font-semibold text-rose-800">
            <UserCircle className="size-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/planners/${planner.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display group inline-flex max-w-full items-center gap-1.5 truncate text-base font-medium tracking-tight underline-offset-4 transition-colors hover:text-rose-700 hover:underline"
              >
                <span className="truncate">{planner.business_name}</span>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-rose-700" />
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {planner.profile.full_name}
                {planner.location ? ` · ${planner.location}` : ""}
              </p>
            </div>
            {planner.review_count > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-100">
                <Star className="size-3 fill-current" />
                {rating.toFixed(1)}
                <span className="text-muted-foreground">
                  · {planner.review_count}
                </span>
              </span>
            )}
          </div>
          {specialtiesArr.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {specialtiesArr.slice(0, 3).map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-100"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {planner.bio && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {planner.bio}
            </p>
          )}
        </div>
      </div>

      {planner.portfolio_items.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {planner.portfolio_items.slice(0, 4).map((it) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={it.id}
              src={it.image_url}
              alt={it.caption ?? ""}
              className="aspect-square w-full rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl bg-rose-50/40 p-3">
        <p className="text-eyebrow font-medium text-rose-700/80">
          {tc("coverLetter")}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
          {proposal.cover_letter}
        </p>
      </div>

      {amount > 0 &&
        (() => {
          const breakdown = Array.isArray(proposal.quote_breakdown)
            ? (proposal.quote_breakdown as Array<{
                label: string;
                amount: number;
              }>).filter(
                (row) =>
                  row &&
                  typeof row.label === "string" &&
                  typeof row.amount === "number"
              )
            : [];
          return (
            <div className="mt-3 overflow-hidden rounded-xl border border-brand-line bg-white/60">
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-eyebrow font-medium text-muted-foreground">
                  {tc("quote")}
                </span>
                <span className="font-display text-lg font-light tracking-tight">
                  {f.currency(amount, proposal.quote_currency)}
                </span>
              </div>
              {breakdown.length > 0 && (
                <div className="border-t border-brand-line bg-rose-50/30 px-3 py-2">
                  <p className="mb-1.5 text-eyebrow font-medium text-rose-700/80">
                    {tc("breakdown")}
                  </p>
                  <ul className="space-y-1">
                    {breakdown.map((row, idx) => (
                      <li
                        key={`${row.label}-${idx}`}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-foreground/80">{row.label}</span>
                        <span className="font-mono tabular-nums text-foreground/70">
                          {f.currency(row.amount, proposal.quote_currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}

      {planner.reviews.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-eyebrow font-medium text-muted-foreground">
            {tc("recentReviews")}
          </p>
          {planner.reviews.slice(0, 1).map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-brand-line bg-white/60 p-3"
            >
              <div className="flex items-center gap-1 text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "size-3",
                      i < r.rating ? "fill-current" : "text-stone-200"
                    )}
                  />
                ))}
                <span className="ms-1 text-xs text-muted-foreground">
                  {r.author.full_name}
                </span>
              </div>
              {r.comment && (
                <p className="mt-1 italic text-xs text-foreground/90">
                  &ldquo;{r.comment}&rdquo;
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {proposedSchedule && proposedSchedule.status === "proposed" && (
        <div className="mt-3 overflow-hidden rounded-xl border border-brand-line bg-rose-50/30">
          <div className="flex items-center justify-between gap-3 border-b border-brand-line bg-white/60 px-3 py-2">
            <span className="text-eyebrow font-medium text-rose-700/80">
              {tc("paymentPlan")}
            </span>
            <span className="text-xs text-muted-foreground">
              {tc("lockedWhenAccept")}
            </span>
          </div>
          <ul className="divide-y divide-rose-100/70 px-3">
            {proposedSchedule.installments.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate text-foreground/90">{i.label}</p>
                  {i.due_date && (
                    <p className="text-xs text-muted-foreground">
                      {tc("due", { date: f.date(i.due_date, "medium") })}
                    </p>
                  )}
                </div>
                <span className="font-mono tabular-nums text-foreground/80">
                  {f.currency(
                    decimalToNumber(i.amount),
                    proposedSchedule.currency
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-brand-line bg-white/60 px-3 py-2 text-sm font-medium">
            <span>{tc("total")}</span>
            <span className="font-mono tabular-nums">
              {f.currency(
                decimalToNumber(proposedSchedule.total_amount),
                proposedSchedule.currency
              )}
            </span>
          </div>
        </div>
      )}

      {canReview && (
        <ReviewSection eventId={eventId} plannerId={planner.id} />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          render={
            <Link
              href={`/planners/${planner.id}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
          className="gap-1.5"
        >
          <ExternalLink className="size-3.5" />
          {tc("viewFullProfile")}
        </Button>
        {isAccepted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
            <CheckCircle2 className="size-3" />
            {tc("engaged")}
          </span>
        ) : isReleased ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 ring-1 ring-stone-200">
            {tc("released")}
          </span>
        ) : isDeclined ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500 ring-1 ring-stone-200">
            {tc("withdrew")}
          </span>
        ) : someoneEngaged ? (
          <Button
            size="sm"
            onClick={onSwitch}
            className="gap-1.5 bg-brand-gradient text-white"
          >
            {tc("switchToThisPlanner")}
          </Button>
        ) : proposedSchedule && proposedSchedule.status === "proposed" ? (
          <Button
            size="sm"
            disabled={acceptingSchedule || !isPending}
            onClick={() =>
              acceptSchedule.mutate({ scheduleId: proposedSchedule.id })
            }
            className="gap-1.5 bg-brand-gradient text-white"
          >
            {acceptingSchedule ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {tc("acceptProposalAndPlan")}
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={isAccepting || !isPending}
            onClick={onAccept}
            className="gap-1.5 bg-brand-gradient text-white"
          >
            {isAccepting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {tc("acceptProposal")}
          </Button>
        )}
      </div>
    </article>
  );
}

function ReviewSection({
  eventId,
  plannerId,
}: {
  eventId: string;
  plannerId: string;
}) {
  const tc = useTranslations("client");
  const tCommon = useTranslations("common");
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: review, isLoading } = trpc.reviews.mineForEvent.useQuery({
    eventId,
    plannerId,
  });

  const remove = trpc.reviews.delete.useMutation({
    onSuccess: () => {
      toast.success(tc("reviewRemovedToast"));
      utils.reviews.mineForEvent.invalidate({ eventId, plannerId });
      utils.proposals.byEvent.invalidate({ eventId });
      utils.planner.byId.invalidate({ id: plannerId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-stone-50 p-3 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {tc("loadingReview")}
      </div>
    );
  }

  if (review) {
    return (
      <div className="mt-3 rounded-xl border border-amber-100/70 bg-amber-50/40 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-eyebrow font-medium text-amber-700/90">
              {tc("yourReview")}
            </p>
            <div className="mt-1 flex items-center gap-1 text-amber-500">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "size-3.5",
                    i < review.rating ? "fill-current" : "text-stone-300"
                  )}
                />
              ))}
            </div>
            {review.comment && (
              <p className="mt-2 italic text-xs text-foreground/85">
                &ldquo;{review.comment}&rdquo;
              </p>
            )}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" />
              }
            >
              <Pencil className="me-1 size-3" />
              {tc("edit")}
            </DialogTrigger>
            <ReviewDialogContent
              eventId={eventId}
              plannerId={plannerId}
              existing={review}
              onClose={() => setOpen(false)}
            />
          </Dialog>
        </div>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: tc("removeReviewConfirm"),
                confirmLabel: tCommon("remove"),
                destructive: true,
              })
            ) {
              remove.mutate({ id: review.id });
            }
          }}
          className="mt-2 text-xs text-stone-500 underline-offset-4 hover:text-rose-700 hover:underline disabled:opacity-50"
        >
          {remove.isPending ? tc("removingReview") : tc("removeReview")}
        </button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-rose-200/80 bg-rose-50/30 p-3">
        <div className="min-w-0">
          <p className="text-eyebrow font-medium text-rose-700/80">
            {tc("shareExperience")}
          </p>
          <p className="mt-0.5 text-xs text-foreground/80">
            {tc("rateThisPlanner")}
          </p>
        </div>
        <DialogTrigger
          render={
            <Button
              size="sm"
              className="gap-1.5 bg-brand-gradient text-white"
            />
          }
        >
          <Star className="size-3.5" />
          {tc("leaveReview")}
        </DialogTrigger>
      </div>
      <ReviewDialogContent
        eventId={eventId}
        plannerId={plannerId}
        existing={null}
        onClose={() => setOpen(false)}
      />
    </Dialog>
  );
}

function ReviewDialogContent({
  eventId,
  plannerId,
  existing,
  onClose,
}: {
  eventId: string;
  plannerId: string;
  existing: { rating: number; comment: string | null } | null;
  onClose: () => void;
}) {
  const tc = useTranslations("client");
  const utils = trpc.useUtils();
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [hover, setHover] = useState<number | null>(null);
  const [comment, setComment] = useState(existing?.comment ?? "");

  const upsert = trpc.reviews.upsert.useMutation({
    onSuccess: () => {
      toast.success(
        existing ? tc("reviewUpdatedToast") : tc("reviewPostedToast")
      );
      utils.reviews.mineForEvent.invalidate({ eventId, plannerId });
      utils.proposals.byEvent.invalidate({ eventId });
      utils.planner.byId.invalidate({ id: plannerId });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      eventId,
      plannerId,
      rating,
      comment: comment.trim() ? comment.trim() : undefined,
    });
  }

  const display = hover ?? rating;

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="font-display text-xl font-light tracking-tight">
          {existing ? tc("editReview") : tc("leaveReview")}
        </DialogTitle>
        <DialogDescription>
          {tc("reviewVisibilityHint")}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{tc("rating")}</Label>
          <div
            className="flex items-center gap-1.5"
            onMouseLeave={() => setHover(null)}
          >
            {Array.from({ length: 5 }).map((_, i) => {
              const v = i + 1;
              return (
                <button
                  key={v}
                  type="button"
                  aria-label={tc("starsAria", { count: v })}
                  onClick={() => setRating(v)}
                  onMouseEnter={() => setHover(v)}
                  className="rounded-md p-0.5 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "size-7 transition-colors",
                      v <= display
                        ? "fill-amber-400 text-amber-400"
                        : "text-stone-300"
                    )}
                  />
                </button>
              );
            })}
            <span className="ms-2 text-sm text-muted-foreground">
              {tc("ratingFraction", { value: display })}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-comment">
            {tc("comment")}{" "}
            <span className="text-xs text-muted-foreground">{tc("optional")}</span>
          </Label>
          <Textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={tc("reviewPlaceholder")}
            rows={5}
            maxLength={2000}
          />
          <p className="text-end text-xs text-muted-foreground">
            {tc("charCount", { count: comment.length, max: 2000 })}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={upsert.isPending}
          >
            {tc("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={upsert.isPending}
            className="bg-brand-gradient text-white"
          >
            {upsert.isPending ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Star className="me-2 size-4" />
            )}
            {existing ? tc("saveChanges") : tc("postReview")}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

function SwitchPlannerForm({
  fromProposalId,
  toProposalId,
  onDone,
}: {
  fromProposalId: string;
  toProposalId: string;
  onDone: () => void;
}) {
  const tc = useTranslations("client");
  const [rating, setRating] = useState(4);
  const [reason, setReason] = useState("");

  const switchMutation = trpc.proposals.switch.useMutation({
    onSuccess: () => {
      toast.success(tc("plannerSwitchedToast"));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) {
      toast.error(tc("switchReasonRequired"));
      return;
    }
    switchMutation.mutate({
      fromProposalId,
      toProposalId,
      rating,
      reason: reason.trim(),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{tc("ratingForOutgoing")}</Label>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => {
            const v = i + 1;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setRating(v)}
                className="text-amber-500 transition-transform hover:scale-110"
                aria-label={tc("starsAria", { count: v })}
              >
                <Star
                  className={cn(
                    "size-7",
                    v <= rating ? "fill-current" : "text-stone-200"
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reason">{tc("reasonForSwitching")}</Label>
        <Textarea
          id="reason"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={tc("switchReasonPlaceholder")}
          className="resize-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          disabled={switchMutation.isPending}
          className="bg-brand-gradient text-white"
        >
          {switchMutation.isPending ? (
            <Loader2 className="me-2 size-4 animate-spin" />
          ) : null}
          {tc("switchPlanners")}
        </Button>
      </div>
    </form>
  );
}
