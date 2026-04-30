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
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
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
import { cn } from "@/lib/utils";
import { SchedulePanel } from "@/components/payments/SchedulePanel";

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
          Event not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button
          variant="outline"
          render={<Link href="/dashboard/planner/proposals" />}
          className="mt-6"
        >
          Back to proposals
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
            className="-ml-2 gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            All proposals
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
              <span className="inline-flex items-center gap-1.5">
                <UserCircle className="size-4" />
                {event.client.full_name}
              </span>
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
  if (!design) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 p-6 text-center backdrop-blur-sm">
        <Wand2 className="mb-3 size-6 text-rose-500" />
        <p className="font-display text-base font-medium tracking-tight">
          No approved design
        </p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          The couple hasn&apos;t locked a design yet.
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
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3">
            <h3 className="font-display text-base font-medium tracking-tight">
              Event details
            </h3>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Edited by the couple
            </span>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <DetailRow label="Title">
              <p className="font-medium">{event.title}</p>
            </DetailRow>
            <DetailRow label="Event date">
              <p className="font-medium">
                {event.event_date
                  ? format(new Date(event.event_date), "PPP")
                  : "Not set"}
              </p>
            </DetailRow>
            <DetailRow label="Venue address" className="sm:col-span-2">
              <p className="font-medium">
                {event.venue || (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </p>
            </DetailRow>
            <DetailRow label="Budget (EGP)">
              <p className="font-medium">
                {decimalToNumber(event.budget) > 0
                  ? formatCurrency(decimalToNumber(event.budget))
                  : "—"}
              </p>
            </DetailRow>
            <DetailRow label="Status">
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
              The couple
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
                <p className="text-xs text-muted-foreground">Client</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use the Messages tab to coordinate. The couple sees the same
              thread.
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
  if (!design) {
    return (
      <div className="rounded-2xl border border-dashed border-rose-200/70 bg-white/40 p-12 text-center">
        <p className="font-display text-lg font-light tracking-tight">
          No approved design yet
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          The couple will lock a design here. You&apos;ll see the full visual
          spec once they do.
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
                Palette
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
            References ({refs.length})
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
            Cinematic preview
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
  vendors: Array<{
    id: string;
    status: string;
    agreed_price: unknown;
    vendor: {
      id: string;
      business_name: string;
      category: string;
      location: string | null;
    };
  }>;
}

function VendorsTab({ event }: { event: VendorsTabEvent }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3">
        <h3 className="font-display text-base font-medium tracking-tight">
          Vendors
        </h3>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Curated for this event
        </span>
      </div>
      {event.vendors.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Users className="mx-auto mb-3 size-7 text-rose-500" />
          <p className="font-display text-lg font-light tracking-tight">
            No vendors yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once you start curating florists, photographers, and caterers
            they&apos;ll show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-rose-100/70">
          {event.vendors.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div>
                <p className="font-medium">{v.vendor.business_name}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {v.vendor.category} · {v.vendor.location ?? "Cairo"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {decimalToNumber(v.agreed_price) > 0
                    ? formatCurrency(decimalToNumber(v.agreed_price))
                    : "—"}
                </span>
                <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700 ring-1 ring-rose-100">
                  {v.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PaymentRow {
  id: string;
  label: string;
  amount: unknown;
  currency: string;
  status: string;
  due_date: Date | null;
  paid_at: Date | null;
  notes: string | null;
  schedule_id: string | null;
}

function PaymentsTab({
  eventId,
  payments,
}: {
  eventId: string;
  payments: PaymentRow[];
}) {
  const utils = trpc.useUtils();
  const [legacyOpen, setLegacyOpen] = useState(false);

  // The schedule-bound payments are managed via SchedulePanel. The legacy
  // ledger ("manual" rows with no schedule_id) is still useful for offline
  // / cash payments either side wants to record.
  const legacy = payments.filter((p) => !p.schedule_id);

  const removePayment = trpc.payments.delete.useMutation({
    onSuccess: () => {
      toast.success("Payment removed");
      utils.events.byId.invalidate({ id: eventId });
    },
    onError: (err) => toast.error(err.message),
  });
  const markPaid = trpc.payments.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Marked paid");
      utils.events.byId.invalidate({ id: eventId });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <SchedulePanel eventId={eventId} side="planner" />

      <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/60 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3">
          <div>
            <h3 className="font-display text-base font-medium tracking-tight">
              Manual ledger
            </h3>
            <p className="text-xs text-muted-foreground">
              Off-platform payments (cash, bank transfer outside Stripe). Use
              this for records only.
            </p>
          </div>
          <Dialog open={legacyOpen} onOpenChange={setLegacyOpen}>
            <DialogTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                />
              }
            >
              <Plus className="size-3" />
              Add manual entry
            </DialogTrigger>
            <AddPaymentDialog
              eventId={eventId}
              onClose={() => setLegacyOpen(false)}
              onCreated={() => {
                utils.events.byId.invalidate({ id: eventId });
                setLegacyOpen(false);
              }}
            />
          </Dialog>
        </div>

        {legacy.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-muted-foreground">
            No off-platform entries yet.
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70">
            {legacy.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.label}</p>
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
                  <span className="text-sm font-medium tabular-nums">
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

function MessagesTab({ eventId }: { eventId: string }) {
  const utils = trpc.useUtils();
  const { data: profile } = trpc.profile.me.useQuery();
  const { data: messages, isLoading } = trpc.messages.byEvent.useQuery(
    { eventId },
    { refetchInterval: 15_000 }
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
    <div className="flex h-[60vh] flex-col overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
      <div className="border-b border-rose-100/70 px-5 py-3">
        <h3 className="font-display text-base font-medium tracking-tight">
          Messages
        </h3>
        <p className="text-xs text-muted-foreground">
          Talk with the couple — everything stays attached to this event.
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
              Start the conversation — share next steps, ask for context, or
              confirm details.
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
