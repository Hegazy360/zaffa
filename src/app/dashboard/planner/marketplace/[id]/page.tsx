"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  Trash2,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function normalizePalette(value: unknown): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.colors)) {
      return obj.colors.filter((c): c is string => typeof c === "string");
    }
  }
  return [];
}

interface RefItem {
  id: string;
  url: string;
  thumbnailUrl?: string;
  category: string;
}

const REFERENCE_CATEGORY_LABELS: Record<string, string> = {
  overall_vibe: "Overall vibe",
  tables: "Tables & seating",
  flowers: "Florals",
  lighting: "Lighting",
  venue_decor: "Decor & structure",
};

// Pull all reference images out of the design.references JSON (grouped by
// category in the venue designer) and flatten into a single gallery list.
function flattenReferences(value: unknown): RefItem[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const out: RefItem[] = [];
  for (const [category, refs] of Object.entries(value as Record<string, unknown>)) {
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
        category,
      });
    }
  }
  return out;
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

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "Date open";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number, currency = "EGP"): string {
  // Intl.NumberFormat throws RangeError when the currency code isn't a valid
  // ISO 4217 string (e.g. while the planner is still typing). Fall back to a
  // plain "amount code" rendering so the live take-home preview never tears
  // the page down.
  try {
    return new Intl.NumberFormat("en-EG", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

export default function BriefDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const utils = trpc.useUtils();

  const { data: brief, isLoading, error } = trpc.marketplace.byId.useQuery({
    id,
  });
  const { data: conflicts } = trpc.availability.conflictsForDate.useQuery(
    { date: brief?.event_date ?? new Date() },
    { enabled: !!brief?.event_date }
  );

  const withdraw = trpc.proposals.withdraw.useMutation({
    onSuccess: () => {
      toast.success("Proposal withdrawn");
      utils.marketplace.byId.invalidate({ id });
      utils.proposals.mine.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-display text-2xl font-light tracking-tight">
          Brief not available
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button
          variant="outline"
          render={<Link href="/dashboard/planner/marketplace" />}
          className="mt-6"
        >
          Back to marketplace
        </Button>
      </div>
    );
  }

  if (isLoading || !brief) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-6xl items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  const design = brief.design;
  const heroImage = design?.media[0]?.url ?? design?.thumbnail ?? null;
  const palette = normalizePalette(design?.palette);
  const budget = decimalToNumber(brief.budget);
  const conflictRows = conflicts ?? [];
  const myProposal = brief.myProposal;

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/dashboard/planner/marketplace" />}
            className="-ml-2 gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to marketplace
          </Button>
        </div>

        <header className="mb-8">
          <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            {brief.event_type}
          </p>
          <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {brief.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              {formatDate(brief.event_date)}
            </span>
            {brief.venue && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" />
                {brief.venue}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <UserCircle className="size-4" />
              with {brief.client_first_name}
            </span>
          </div>
        </header>

        {!brief.is_open && !myProposal && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            This event already has an active planner. New proposals aren&apos;t
            being accepted right now.
          </div>
        )}

        {conflictRows.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Heads up — schedule conflict</p>
              <ul className="mt-1 space-y-0.5 text-amber-800">
                {conflictRows.map((c) =>
                  c.kind === "block" ? (
                    <li key={c.id}>
                      You blocked these dates ({formatDate(c.start_date)} –{" "}
                      {formatDate(c.end_date)})
                      {c.reason ? ` — ${c.reason}` : ""}
                    </li>
                  ) : (
                    <li key={c.id}>
                      You&apos;re already booked: {c.title}
                    </li>
                  )
                )}
              </ul>
              <p className="mt-1 text-xs">You can still apply if it works.</p>
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-12">
          {/* Design */}
          <section className="lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/70 backdrop-blur-sm">
              <div className="relative aspect-[4/3] bg-gradient-to-br from-rose-50 to-amber-50/60">
                {heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroImage}
                    alt={design?.name ?? brief.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="size-8 text-rose-400/70" />
                  </div>
                )}
              </div>
              <div className="space-y-4 p-5">
                {design?.name && (
                  <h2 className="font-display text-xl font-light tracking-tight">
                    {design.name}
                  </h2>
                )}
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
                          <span className="font-mono text-muted-foreground">
                            {c}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {design?.style_notes && (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Style notes
                    </p>
                    <p className="text-sm text-foreground/90">
                      {design.style_notes}
                    </p>
                  </div>
                )}
                {(() => {
                  const refs = flattenReferences(design?.references);
                  if (refs.length === 0) return null;
                  return (
                    <div>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        References ({refs.length})
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {refs.slice(0, 12).map((r) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={r.id}
                            src={r.thumbnailUrl ?? r.url}
                            alt={REFERENCE_CATEGORY_LABELS[r.category] ?? ""}
                            className="aspect-square w-full rounded-lg object-cover"
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  if (!design) return null;
                  // Only show videos generated from the displayed render.
                  // Legacy videos (parent_id === null) only appear when the
                  // design has a single render — otherwise we can't tell
                  // which render they belong to.
                  const renders = design.media.filter(
                    (m) => m.type === "render"
                  );
                  const selectedRender =
                    (design.thumbnail
                      ? renders.find((m) => m.url === design.thumbnail)
                      : null) ??
                    renders[0] ??
                    null;
                  const videos = design.media.filter((m) => {
                    if (m.type !== "video") return false;
                    if (selectedRender && m.parent_id === selectedRender.id)
                      return true;
                    if (m.parent_id === null && renders.length <= 1)
                      return true;
                    return false;
                  });
                  if (videos.length === 0) return null;
                  return (
                    <div>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        Cinematic preview
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {videos.slice(0, 2).map((v) => (
                          <video
                            key={v.id}
                            src={v.url}
                            controls
                            className="aspect-video w-full rounded-xl bg-black"
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </section>

          {/* Brief facts + proposal */}
          <aside className="lg:col-span-5">
            <div className="space-y-5">
              <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-5 backdrop-blur-sm">
                <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Brief
                </p>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Event type</dt>
                    <dd className="capitalize">{brief.event_type}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Date</dt>
                    <dd>{formatDate(brief.event_date)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Venue</dt>
                    <dd className="text-right">{brief.venue || "Open"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Budget</dt>
                    <dd>{budget > 0 ? formatCurrency(budget) : "Not shared"}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-5 backdrop-blur-sm">
                {myProposal ? (
                  <MyProposalState
                    proposal={myProposal}
                    onWithdraw={() =>
                      withdraw.mutate({ id: myProposal.id })
                    }
                    withdrawing={withdraw.isPending}
                    onEdited={() => {
                      utils.marketplace.byId.invalidate({ id });
                      utils.proposals.mine.invalidate();
                    }}
                  />
                ) : !brief.is_open ? (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      An active planner is engaged on this event.
                    </p>
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() => router.push("/dashboard/planner/marketplace")}
                    >
                      Browse other briefs
                    </Button>
                  </div>
                ) : (
                  <ProposeDialog
                    eventId={brief.id}
                    eventTitle={brief.title}
                    onSubmitted={() => {
                      utils.marketplace.byId.invalidate({ id });
                      utils.marketplace.list.invalidate();
                      utils.proposals.mine.invalidate();
                    }}
                  />
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

interface ProposalSummary {
  id: string;
  status: string;
  cover_letter: string;
  quote_amount: unknown;
  quote_currency: string;
  quote_breakdown: unknown;
  created_at: Date;
  updated_at: Date;
  event_id?: string;
}

function MyProposalState({
  proposal,
  onWithdraw,
  withdrawing,
  onEdited,
}: {
  proposal: ProposalSummary;
  onWithdraw: () => void;
  withdrawing: boolean;
  onEdited: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  const statusLabel: Record<string, { label: string; className: string }> = {
    pending: {
      label: "Standing by",
      className: "bg-amber-50 text-amber-800 ring-amber-200",
    },
    accepted: {
      label: "Accepted",
      className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    },
    released: {
      label: "Released",
      className: "bg-stone-100 text-stone-700 ring-stone-200",
    },
    declined: {
      label: "Withdrawn",
      className: "bg-stone-100 text-stone-500 ring-stone-200",
    },
  };
  const s = statusLabel[proposal.status] ?? statusLabel.pending;
  const amount = decimalToNumber(proposal.quote_amount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Your proposal
        </p>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${s.className}`}
        >
          {s.label}
        </span>
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
            <div className="overflow-hidden rounded-xl border border-rose-100/70 bg-white/60">
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Quote
                </span>
                <span className="font-display text-xl font-light tracking-tight">
                  {formatCurrency(amount, proposal.quote_currency)}
                </span>
              </div>
              {breakdown.length > 0 && (
                <div className="border-t border-rose-100/70 bg-rose-50/30 px-3 py-2">
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
                    Breakdown
                  </p>
                  <ul className="space-y-1">
                    {breakdown.map((row, idx) => (
                      <li
                        key={`${row.label}-${idx}`}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-foreground/80">{row.label}</span>
                        <span className="font-mono tabular-nums text-foreground/70">
                          {formatCurrency(row.amount, proposal.quote_currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Cover letter
        </p>
        <p className="whitespace-pre-wrap text-sm text-foreground/90">
          {proposal.cover_letter}
        </p>
      </div>
      {proposal.status === "pending" && (
        <div className="flex flex-col gap-2 pt-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger render={<Button variant="outline" />}>
              Edit proposal
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display text-xl font-light tracking-tight">
                  Edit your proposal
                </DialogTitle>
                <DialogDescription>
                  Tweak the cover letter or quote while it&apos;s still pending.
                </DialogDescription>
              </DialogHeader>
              <ProposalForm
                mode="edit"
                proposal={proposal}
                onDone={() => {
                  setEditOpen(false);
                  onEdited();
                }}
              />
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            onClick={onWithdraw}
            disabled={withdrawing}
            className="text-stone-600 hover:text-rose-700"
          >
            {withdrawing ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" />
            )}
            Withdraw proposal
          </Button>
        </div>
      )}
    </div>
  );
}

function ProposeDialog({
  eventId,
  eventTitle,
  onSubmitted,
}: {
  eventId: string;
  eventTitle: string;
  onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="text-center">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Submit a proposal
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          Share your approach and a quote. The couple will see your portfolio
          and reviews next to your message.
        </p>
        <DialogTrigger
          render={
            <Button className="bg-gradient-to-r from-rose-600 to-amber-500 text-white" />
          }
        >
          <Send className="mr-2 size-4" />
          Write a proposal
        </DialogTrigger>
      </div>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-light tracking-tight">
            Propose for {eventTitle}
          </DialogTitle>
          <DialogDescription>
            Lead with what you noticed about the design and how you&apos;d
            bring it to life.
          </DialogDescription>
        </DialogHeader>
        <ProposalForm
          mode="create"
          eventId={eventId}
          onDone={() => {
            setOpen(false);
            onSubmitted();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface BreakdownRow {
  label: string;
  amount: string;
}

interface InstallmentRow {
  label: string;
  amount: string;
  due_date: string;
}

const PLAN_TEMPLATES: Record<string, number[]> = {
  "50/50": [0.5, 0.5],
  "30/40/30": [0.3, 0.4, 0.3],
  "25/25/25/25": [0.25, 0.25, 0.25, 0.25],
};
const DEFAULT_LABELS = ["Deposit", "Mid-event", "Final", "Final"];
// Default platform fee mirrored from the server. We can fetch it via tRPC
// later if we want to make it configurable per planner.
const PLANNER_FORM_DEFAULT_FEE_PCT = 8;

function makeTemplateRows(
  template: string,
  total: number
): InstallmentRow[] {
  const fractions = PLAN_TEMPLATES[template];
  if (!fractions || total <= 0) return [];
  return fractions.map((f, i) => ({
    label: DEFAULT_LABELS[i] ?? `Installment ${i + 1}`,
    amount: (Math.round(total * f * 100) / 100).toString(),
    due_date: "",
  }));
}

function ProposalForm({
  mode,
  eventId,
  proposal,
  onDone,
}: {
  mode: "create" | "edit";
  eventId?: string;
  proposal?: ProposalSummary;
  onDone: () => void;
}) {
  const initialBreakdown: BreakdownRow[] = (() => {
    if (
      proposal?.quote_breakdown &&
      Array.isArray(proposal.quote_breakdown)
    ) {
      return (proposal.quote_breakdown as Array<{ label: string; amount: number }>).map(
        (r) => ({ label: r.label, amount: String(r.amount) })
      );
    }
    return [];
  })();

  const [coverLetter, setCoverLetter] = useState(
    proposal?.cover_letter ?? ""
  );
  const [quote, setQuote] = useState<string>(
    proposal?.quote_amount ? String(decimalToNumber(proposal.quote_amount)) : ""
  );
  const [currency, setCurrency] = useState<string>(
    proposal?.quote_currency ?? "EGP"
  );
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>(initialBreakdown);

  // If a schedule already exists on this proposal, hydrate the rows so
  // editing carries them through. We fetch via a separate tRPC query keyed
  // on the proposal's event id.
  const { data: existingSchedule } = trpc.paymentSchedules.forEvent.useQuery(
    { eventId: eventId ?? proposal?.event_id ?? "" },
    { enabled: !!(eventId ?? proposal?.event_id) }
  );

  const [template, setTemplate] = useState<string>("custom");
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);

  // First-time hydration from an existing proposed schedule.
  useEffect(() => {
    if (!existingSchedule || installments.length > 0) return;
    if (existingSchedule.status !== "proposed" && existingSchedule.status !== "draft") {
      return;
    }
    const hydrated = existingSchedule.installments.map((i) => ({
      label: i.label,
      amount: String(decimalToNumber(i.amount)),
      due_date: i.due_date
        ? new Date(i.due_date).toISOString().slice(0, 10)
        : "",
    }));
    if (hydrated.length > 0) setInstallments(hydrated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSchedule]);

  // While a preset is active, keep the rows in sync with the quote so that
  // typing the quote *after* picking the preset auto-fills the plan. We
  // skip in "custom" mode so manual edits aren't clobbered.
  useEffect(() => {
    if (template === "custom") return;
    const total = Number(quote) || 0;
    if (total <= 0) return;
    setInstallments(makeTemplateRows(template, total));
    // We deliberately omit `installments` from deps — including it would
    // create a render loop because we're the writer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, template]);

  const utils = trpc.useUtils();
  const create = trpc.proposals.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.proposals.update.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const proposeSchedule = trpc.paymentSchedules.propose.useMutation({
    onError: (e) => toast.error(`Couldn't save payment plan: ${e.message}`),
  });

  const submitting =
    create.isPending || update.isPending || proposeSchedule.isPending;

  function buildBreakdown() {
    const cleaned = breakdown
      .map((r) => ({ label: r.label.trim(), amount: Number(r.amount) || 0 }))
      .filter((r) => r.label.length > 0);
    return cleaned.length > 0 ? cleaned : null;
  }

  function buildInstallments() {
    const cleaned = installments
      .map((r) => ({
        label: r.label.trim(),
        amount: Number(r.amount) || 0,
        due_date: r.due_date ? new Date(r.due_date) : null,
      }))
      .filter((r) => r.label.length > 0 && r.amount > 0);
    return cleaned.length > 0 ? cleaned : null;
  }

  // Live totals for the take-home preview. We compute against whatever
  // installments the planner has typed; if there are none we fall back to
  // the bare quote so they still see the math.
  const installmentTotal =
    installments.reduce((s, r) => s + (Number(r.amount) || 0), 0) ||
    Number(quote) ||
    0;
  const feeAmount =
    Math.round(installmentTotal * PLANNER_FORM_DEFAULT_FEE_PCT) / 100;
  const takeHome =
    Math.round((installmentTotal - feeAmount) * 100) / 100;

  function applyTemplate(name: string) {
    setTemplate(name);
    if (name === "custom") {
      // Switching back to custom keeps whatever rows exist so the planner
      // can hand-edit them. Clearing here would feel destructive.
      return;
    }
    // Use the quote when available, otherwise fall back to whatever the
    // planner has already typed in installments. Either way, we *replace*
    // the rows instead of leaving stale entries from a previous template.
    const total =
      Number(quote) ||
      installments.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    if (total <= 0) {
      toast.error("Set a quote first to auto-fill the plan");
      setInstallments([]);
      return;
    }
    setInstallments(makeTemplateRows(name, total));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (coverLetter.trim().length < 20) {
      toast.error("Cover letter should be at least 20 characters");
      return;
    }
    const quoteAmount = quote ? Number(quote) : null;
    const quote_breakdown = buildBreakdown();
    const installmentRows = buildInstallments();

    // If the planner provided an installment plan, the totals must agree
    // with the quote so the client doesn't see a mismatch on accept.
    if (installmentRows && quoteAmount) {
      const sum = installmentRows.reduce((s, r) => s + r.amount, 0);
      if (Math.abs(sum - quoteAmount) > 0.5) {
        toast.error(
          `Plan total (${sum}) doesn't match quote (${quoteAmount}).`
        );
        return;
      }
    }

    try {
      let proposalId: string;
      if (mode === "create" && eventId) {
        const created = await create.mutateAsync({
          eventId,
          coverLetter: coverLetter.trim(),
          quote_amount: quoteAmount,
          quote_currency: currency,
          quote_breakdown,
        });
        proposalId = created.id;
      } else if (mode === "edit" && proposal) {
        await update.mutateAsync({
          id: proposal.id,
          coverLetter: coverLetter.trim(),
          quote_amount: quoteAmount,
          quote_currency: currency,
          quote_breakdown,
        });
        proposalId = proposal.id;
      } else {
        return;
      }

      if (installmentRows) {
        await proposeSchedule.mutateAsync({
          proposalId,
          currency,
          installments: installmentRows.map((r) => ({
            label: r.label,
            amount: r.amount,
            due_date: r.due_date,
          })),
        });
      }

      toast.success(mode === "create" ? "Proposal sent" : "Proposal updated");
      utils.paymentSchedules.forEvent.invalidate();
      onDone();
    } catch {
      // toasts already surfaced from per-mutation onError
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cover">Cover letter</Label>
        <Textarea
          id="cover"
          rows={6}
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          placeholder="What drew you to this brief? How would you bring this design to life?"
          className="resize-none"
        />
        <p className="text-[11px] text-muted-foreground">
          {coverLetter.length}/5000
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="quote">Quote (optional)</Label>
          <Input
            id="quote"
            type="number"
            min="0"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="e.g. 80000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <CurrencyInput
            id="currency"
            value={currency}
            onChange={setCurrency}
            placeholder="EGP"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Breakdown (optional)</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setBreakdown((rows) => [...rows, { label: "", amount: "" }])
            }
          >
            Add row
          </Button>
        </div>
        {breakdown.map((row, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-7"
              placeholder="Decor & florals"
              value={row.label}
              onChange={(e) =>
                setBreakdown((rows) =>
                  rows.map((r, i) =>
                    i === idx ? { ...r, label: e.target.value } : r
                  )
                )
              }
            />
            <Input
              className="col-span-4"
              type="number"
              placeholder="0"
              value={row.amount}
              onChange={(e) =>
                setBreakdown((rows) =>
                  rows.map((r, i) =>
                    i === idx ? { ...r, amount: e.target.value } : r
                  )
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="col-span-1"
              onClick={() =>
                setBreakdown((rows) => rows.filter((_, i) => i !== idx))
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-rose-100/70 bg-rose-50/40 p-4">
        <div>
          <Label className="text-sm">Payment plan</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Optional. Pick a template or build a custom plan. The client
            confirms it when they accept your proposal.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["50/50", "30/40/30", "25/25/25/25", "custom"] as const).map(
            (t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={template === t ? "default" : "outline"}
                onClick={() => applyTemplate(t)}
                className={
                  template === t
                    ? "h-7 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
                    : "h-7"
                }
              >
                {t === "custom" ? "Custom" : t}
              </Button>
            )
          )}
          {installments.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setInstallments([])}
              className="h-7 ml-auto text-muted-foreground hover:text-rose-700"
            >
              Clear
            </Button>
          )}
        </div>

        {installments.map((row, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-5"
              placeholder="Deposit"
              value={row.label}
              onChange={(e) =>
                setInstallments((rows) =>
                  rows.map((r, i) =>
                    i === idx ? { ...r, label: e.target.value } : r
                  )
                )
              }
            />
            <Input
              className="col-span-3"
              type="number"
              min="0"
              placeholder="0"
              value={row.amount}
              onChange={(e) =>
                setInstallments((rows) =>
                  rows.map((r, i) =>
                    i === idx ? { ...r, amount: e.target.value } : r
                  )
                )
              }
            />
            <Input
              className="col-span-3"
              type="date"
              value={row.due_date}
              onChange={(e) =>
                setInstallments((rows) =>
                  rows.map((r, i) =>
                    i === idx ? { ...r, due_date: e.target.value } : r
                  )
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="col-span-1"
              onClick={() =>
                setInstallments((rows) => rows.filter((_, i) => i !== idx))
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        {(installments.length > 0 || template === "custom") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setInstallments((rows) => [
                ...rows,
                {
                  label: DEFAULT_LABELS[rows.length] ?? `Installment ${rows.length + 1}`,
                  amount: "",
                  due_date: "",
                },
              ])
            }
          >
            Add installment
          </Button>
        )}

        {installmentTotal > 0 && (
          <div className="rounded-xl border border-rose-100/70 bg-white/80 px-3 py-2 text-xs">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              Take-home preview
            </p>
            <ul className="space-y-0.5">
              <li className="flex justify-between">
                <span className="text-muted-foreground">Client pays</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(installmentTotal, currency)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">
                  Platform fee ({PLANNER_FORM_DEFAULT_FEE_PCT}%)
                </span>
                <span className="font-mono tabular-nums text-foreground/70">
                  − {formatCurrency(feeAmount, currency)}
                </span>
              </li>
              <li className="flex justify-between border-t border-rose-100/60 pt-1 font-medium">
                <span>Your take-home</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(takeHome, currency)}
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="submit"
          disabled={submitting}
          className="bg-gradient-to-r from-rose-600 to-amber-500 text-white"
        >
          {submitting ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          {mode === "create" ? "Send proposal" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
