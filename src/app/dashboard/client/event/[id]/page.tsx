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
  Clock,
  CreditCard,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
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

const TABS = ["overview", "design", "vendors", "payments", "messages"] as const;
type TabValue = (typeof TABS)[number];

const STATUS_OPTIONS: Array<{ value: EventStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "planning", label: "Planning" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
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

function formatCurrency(amount: number, currency = "EGP"): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
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
          Event not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message}
        </p>
        <Button
          variant="outline"
          render={<Link href="/dashboard/client" />}
          className="mt-6"
        >
          Back to dashboard
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
    approvedDesign?.media[0]?.url ?? approvedDesign?.thumbnail ?? null;
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
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background dark:from-rose-950/15">
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
            className="-ml-2 gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            All events
          </Button>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
              statusStyles[event.status] ?? statusStyles.draft
            )}
          >
            <CircleDot className="mr-1 size-2.5" />
            {event.status.replace("_", " ")}
          </span>
        </div>

        {/* Hero */}
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
                  ? format(new Date(event.event_date), "PPP")
                  : "Date not set"}
              </span>
              {event.venue && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {event.venue}
                </span>
              )}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <Stat
                label="Days to go"
                value={
                  daysUntil == null
                    ? "—"
                    : daysUntil < 0
                      ? "Past"
                      : `${daysUntil}`
                }
              />
              <Stat
                label="Budget"
                value={budget > 0 ? formatCurrency(budget) : "—"}
              />
              <Stat
                label="Paid"
                value={
                  totalAll > 0
                    ? `${Math.round((totalPaid / totalAll) * 100)}%`
                    : "—"
                }
                hint={
                  totalAll > 0
                    ? `${formatCurrency(totalPaid)} of ${formatCurrency(totalAll)}`
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
          <TabsList className="mb-6 flex w-full flex-wrap gap-1 bg-rose-50/60 p-1 ring-1 ring-rose-100/70">
            <TabsTrigger value="overview" className="gap-1.5">
              <Sparkles className="size-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="design" className="gap-1.5">
              <Wand2 className="size-3.5" />
              Design
            </TabsTrigger>
            <TabsTrigger value="vendors" className="gap-1.5">
              <Users className="size-3.5" />
              Vendors
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <CreditCard className="size-3.5" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-1.5">
              <MessageSquare className="size-3.5" />
              Messages
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

          <TabsContent value="vendors">
            <VendorsTab event={event} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentsTab eventId={event.id} payments={event.payments} />
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
    <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-4 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/70">
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
  media: Array<{ url: string }>;
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
  if (!design) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 p-6 text-center backdrop-blur-sm">
        <Wand2 className="mb-3 size-6 text-rose-500" />
        <p className="font-display text-base font-medium tracking-tight">
          No design attached
        </p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Pick a design from the Design tab to anchor this event.
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/venue-designer/${design.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 ring-1 ring-foreground/[0.04] backdrop-blur-sm transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)] dark:border-rose-900/30 dark:bg-card/80"
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
        <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700 backdrop-blur-sm">
          <CheckCircle2 className="size-3" />
          Approved design
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
          Open in venue designer
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
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
      toast.success("Event updated");
      setEditing(false);
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = trpc.events.delete.useMutation({
    onSuccess: () => {
      toast.success("Event deleted");
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

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Details */}
      <div className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
          <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3 dark:border-rose-900/30">
            <h3 className="font-display text-base font-medium tracking-tight">
              Event details
            </h3>
            {!editing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                className="h-8 gap-1 text-xs"
              >
                <Pencil className="size-3" />
                Edit
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
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={update.isPending}
                  onClick={handleSave}
                  className="h-8 gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-xs text-white hover:opacity-90"
                >
                  {update.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <DetailRow label="Title">
              {editing ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              ) : (
                <p className="font-medium">{event.title}</p>
              )}
            </DetailRow>

            <DetailRow label="Event date">
              {editing ? (
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              ) : (
                <p className="font-medium">
                  {event.event_date
                    ? format(new Date(event.event_date), "PPP")
                    : "Not set"}
                </p>
              )}
            </DetailRow>

            <DetailRow label="Venue address" className="sm:col-span-2">
              {editing ? (
                <Input
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g. Sofitel Cairo El Gezirah, Zamalek"
                />
              ) : (
                <p className="font-medium">
                  {event.venue || (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </p>
              )}
            </DetailRow>

            <DetailRow label="Budget (EGP)">
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
                    ? formatCurrency(decimalToNumber(event.budget))
                    : "—"}
                </p>
              )}
            </DetailRow>

            <DetailRow label="Status">
              {editing ? (
                <Select
                  items={STATUS_OPTIONS}
                  value={status}
                  onValueChange={(v) => v && setStatus(v as EventStatus)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
                    statusStyles[event.status] ?? statusStyles.draft
                  )}
                >
                  {event.status.replace("_", " ")}
                </span>
              )}
            </DetailRow>
          </div>
        </div>

        {/* Danger zone */}
        <div className="mt-6 rounded-2xl border border-stone-200/70 bg-stone-50/50 p-4 dark:border-stone-800 dark:bg-card/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Delete this event</p>
              <p className="text-xs text-muted-foreground">
                The event and all of its messages and payments will be removed.
                The linked design stays in your atelier.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${event.title}"? This cannot be undone.`
                  )
                ) {
                  remove.mutate({ id: event.id });
                }
              }}
              className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Planner sidebar */}
      <div className="lg:col-span-1">
        <div className="sticky top-24 overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
          <div className="border-b border-rose-100/70 px-5 py-3 dark:border-rose-900/30">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
              Your planner
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
                  <MapPin className="mr-1 inline size-3" />
                  {event.planner.location}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2 p-5 text-center">
              <p className="text-sm text-muted-foreground">
                No planner assigned yet.
              </p>
              <p className="text-xs text-muted-foreground">
                We&apos;ll match you with one based on your design.
              </p>
            </div>
          )}
        </div>
      </div>
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
      <Label className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
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
  const { data: allDesigns } = trpc.venueDesigns.list.useQuery();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const attach = trpc.events.attachDesign.useMutation({
    onSuccess: () => {
      toast.success("Design attached to event");
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
      <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
        <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3 dark:border-rose-900/30">
          <h3 className="font-display text-base font-medium tracking-tight">
            The design we&apos;re building
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
              Swap design
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Swap the approved design</DialogTitle>
                <DialogDescription>
                  Pick another design from your atelier to anchor this event.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No other designs to choose from yet.
                  </p>
                ) : (
                  candidates.map((d) => {
                    const img =
                      d.media[0]?.url ?? d.thumbnail ?? null;
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
                        className="flex w-full items-center gap-3 rounded-xl border border-rose-100/70 bg-white/60 p-2.5 text-left transition-all hover:bg-rose-50/60 disabled:opacity-50 dark:border-rose-900/30 dark:bg-card/60"
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
                        <ArrowRight className="size-4 text-muted-foreground" />
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
              {approvedDesign.media[0]?.url || approvedDesign.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    approvedDesign.media[0]?.url ??
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
                    Approved{" "}
                    {formatDistanceToNow(
                      new Date(approvedDesign.approved_at),
                      { addSuffix: true }
                    )}
                  </p>
                )}
              </div>
              {normalizePalette(approvedDesign.palette).length > 0 && (
                <div>
                  <p className="text-[0.6rem] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                    Palette
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
                className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
              >
                Open in venue designer
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <Wand2 className="mx-auto mb-3 size-7 text-rose-500" />
            <p className="font-display text-lg font-light tracking-tight">
              No design attached yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the swap button above to pick from your atelier.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vendors tab — read-only list
// ---------------------------------------------------------------------------

interface VendorRow {
  id: string;
  status: string;
  agreed_price: unknown;
  vendor: {
    id: string;
    business_name: string;
    category: string;
    location: string | null;
  };
}

function VendorsTab({
  event,
}: {
  event: { vendors: VendorRow[] };
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
      <div className="border-b border-rose-100/70 px-5 py-3 dark:border-rose-900/30">
        <h3 className="font-display text-base font-medium tracking-tight">
          Vendors on this event
        </h3>
      </div>
      {event.vendors.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Users className="mx-auto mb-3 size-7 text-rose-500" />
          <p className="font-display text-lg font-light tracking-tight">
            No vendors yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your planner will start matching vendors based on your design.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-rose-100/70 dark:divide-rose-900/30">
          {event.vendors.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div>
                <p className="font-medium">{row.vendor.business_name}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {row.vendor.category}
                  {row.vendor.location && ` · ${row.vendor.location}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {decimalToNumber(row.agreed_price) > 0 && (
                  <span className="text-sm font-medium">
                    {formatCurrency(decimalToNumber(row.agreed_price))}
                  </span>
                )}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
                    row.status === "accepted"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : row.status === "declined"
                        ? "bg-stone-50 text-stone-500 ring-stone-200"
                        : "bg-amber-50 text-amber-800 ring-amber-200"
                  )}
                >
                  {row.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments tab — totals, list, add, mark paid
// ---------------------------------------------------------------------------

interface PaymentRow {
  id: string;
  label: string;
  amount: unknown;
  currency: string;
  status: string;
  due_date: Date | null;
  paid_at: Date | null;
  notes: string | null;
}

function PaymentsTab({
  eventId,
  payments,
}: {
  eventId: string;
  payments: PaymentRow[];
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const total = payments.reduce((sum, p) => sum + decimalToNumber(p.amount), 0);
  const paid = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + decimalToNumber(p.amount), 0);
  const owed = total - paid;
  const currency = payments[0]?.currency ?? "EGP";

  const markPaid = trpc.payments.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Marked paid");
      utils.events.byId.invalidate({ id: eventId });
    },
    onError: (err) => toast.error(err.message),
  });
  const removePayment = trpc.payments.delete.useMutation({
    onSuccess: () => {
      toast.success("Payment removed");
      utils.events.byId.invalidate({ id: eventId });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total" value={formatCurrency(total, currency)} />
        <Stat label="Paid" value={formatCurrency(paid, currency)} />
        <Stat label="Owed" value={formatCurrency(owed, currency)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
        <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3 dark:border-rose-900/30">
          <h3 className="font-display text-base font-medium tracking-tight">
            Schedule
          </h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button
                  size="sm"
                  className="h-8 gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-xs text-white hover:opacity-90"
                />
              }
            >
              <Plus className="size-3" />
              Add payment
            </DialogTrigger>
            <AddPaymentDialog
              eventId={eventId}
              onClose={() => setOpen(false)}
              onCreated={() => {
                utils.events.byId.invalidate({ id: eventId });
                setOpen(false);
              }}
            />
          </Dialog>
        </div>

        {payments.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CreditCard className="mx-auto mb-3 size-7 text-rose-500" />
            <p className="font-display text-lg font-light tracking-tight">
              No payments yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Track deposits and installments so you and your planner stay
              aligned.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70 dark:divide-rose-900/30">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.label}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {p.due_date && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        Due {format(new Date(p.due_date), "PP")}
                      </span>
                    )}
                    {p.paid_at && (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <Check className="size-3" />
                        Paid {format(new Date(p.paid_at), "PP")}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    {formatCurrency(decimalToNumber(p.amount), p.currency)}
                  </span>
                  {p.status !== "paid" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={markPaid.isPending}
                      onClick={() => markPaid.mutate({ id: p.id })}
                      className="h-7 gap-1 text-xs"
                    >
                      <Check className="size-3" />
                      Mark paid
                    </Button>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                      Paid
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (window.confirm(`Remove "${p.label}"?`)) {
                        removePayment.mutate({ id: p.id });
                      }
                    }}
                    className="size-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddPaymentDialog({
  eventId,
  onClose,
  onCreated,
}: {
  eventId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const create = trpc.payments.create.useMutation({
    onSuccess: () => {
      toast.success("Payment added");
      setLabel("");
      setAmount("");
      setDueDate("");
      setNotes("");
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add a payment</DialogTitle>
        <DialogDescription>
          Track a deposit or installment for this event.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="payment-label">Label</Label>
          <Input
            id="payment-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Venue deposit"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Amount (EGP)</Label>
            <Input
              id="payment-amount"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-due">Due date</Label>
            <Input
              id="payment-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment-notes">Notes (optional)</Label>
          <Textarea
            id="payment-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any context for this payment"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={create.isPending || !label.trim() || !amount}
          onClick={() =>
            create.mutate({
              eventId,
              label: label.trim(),
              amount: parseFloat(amount) || 0,
              due_date: dueDate ? new Date(dueDate) : null,
              notes: notes.trim() || null,
            })
          }
          className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
        >
          {create.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Add payment
        </Button>
      </div>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Messages tab
// ---------------------------------------------------------------------------

function MessagesTab({ eventId }: { eventId: string }) {
  const utils = trpc.useUtils();
  const { data: profile } = trpc.profile.me.useQuery();
  const { data: messages, isLoading } = trpc.messages.byEvent.useQuery(
    { eventId },
    { refetchInterval: 15_000 }
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
    <div className="flex h-[60vh] flex-col overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
      <div className="border-b border-rose-100/70 px-5 py-3 dark:border-rose-900/30">
        <h3 className="font-display text-base font-medium tracking-tight">
          Messages
        </h3>
        <p className="text-xs text-muted-foreground">
          Talk to your planner — everything stays attached to this event.
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
              Say hello
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Share thoughts about the design, ask questions, or coordinate
              logistics. Your planner sees these messages too.
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
                    {formatDistanceToNow(new Date(m.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-rose-100/70 p-3 dark:border-rose-900/30">
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
            placeholder="Write a message…"
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
