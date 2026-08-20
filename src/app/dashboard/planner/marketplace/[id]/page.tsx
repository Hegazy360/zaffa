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
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFormatters } from "@/lib/use-formatters";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InspirationBoard } from "@/components/venue-designer/InspirationBoard";

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

export default function BriefDetailPage() {
  const params = useParams();
  const t = useTranslations("marketplace");
  const f = useFormatters();
  const router = useRouter();
  const id = params.id as string;
  const utils = trpc.useUtils();
  const formatBriefDate = (
    date: Date | string | null | undefined,
  ): string => (date ? f.date(date, "long") : t("dateOpen"));

  const { data: brief, isLoading, error } = trpc.marketplace.byId.useQuery({
    id,
  });
  const { data: conflicts } = trpc.availability.conflictsForDate.useQuery(
    { date: brief?.event_date ?? new Date() },
    { enabled: !!brief?.event_date }
  );

  const withdraw = trpc.proposals.withdraw.useMutation({
    onSuccess: () => {
      toast.success(t("proposalWithdrawn"));
      utils.marketplace.byId.invalidate({ id });
      utils.proposals.mine.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Planner-journey funnel, fired the first time the brief actually
  // resolves. The mutationless query alone isn't a "view", we wait for
  // the data so cancelled / forbidden loads don't pollute the count.
  useEffect(() => {
    if (!brief) return;
    track(ANALYTICS_EVENTS.BRIEF_VIEWED, {
      event_id: brief.id,
      event_type: brief.event_type,
      has_design: Boolean(brief.design),
      has_my_proposal: Boolean(brief.myProposal),
    });
    // We intentionally only track once per brief id; further re-renders
    // (e.g. proposal mutations) shouldn't re-fire the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief?.id]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-display text-2xl font-light tracking-tight">
          {t("briefNotAvailable")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button
          variant="outline"
          render={<Link href="/dashboard/planner/marketplace" />}
          className="mt-6"
        >
          {t("backToMarketplace")}
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
  const guestsLabel: string | null = (() => {
    if (design?.guest_count && design.guest_count > 0) {
      // The exact count is the most useful signal for the planner & their
      // vendors (catering price, table count, room sizing).
      return t("guestsExact", { count: design.guest_count });
    }
    switch (design?.size) {
      case "intimate":
        return t("guestsIntimate");
      case "medium":
        return t("guestsMedium");
      case "large":
        return t("guestsLarge");
      default:
        return null;
    }
  })();

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
            className="-ms-2 gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
            {t("backToMarketplace")}
          </Button>
        </div>

        <header className="mb-8">
          <p className="mb-2 text-eyebrow font-medium text-rose-700/80">
            {brief.event_type}
          </p>
          <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {brief.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              {formatBriefDate(brief.event_date)}
            </span>
            {brief.venue && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" />
                {brief.venue}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <UserCircle className="size-4" />
              {t("withSomeone", { firstName: brief.client_first_name })}
            </span>
          </div>
        </header>

        {!brief.is_open && !myProposal && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            {t("alreadyHasPlanner")}
          </div>
        )}

        {conflictRows.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">{t("scheduleConflictTitle")}</p>
              <ul className="mt-1 space-y-0.5 text-amber-800">
                {conflictRows.map((c) =>
                  c.kind === "block" ? (
                    <li key={c.id}>
                      {t("scheduleConflictBlocked", {
                        start: formatBriefDate(c.start_date),
                        end: formatBriefDate(c.end_date),
                        reason: c.reason ? ` - ${c.reason}` : "",
                      })}
                    </li>
                  ) : (
                    <li key={c.id}>
                      {t("scheduleConflictBooked", { title: c.title })}
                    </li>
                  )
                )}
              </ul>
              <p className="mt-1 text-xs">{t("scheduleConflictApply")}</p>
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-12">
          {/* Design */}
          <section className="space-y-6 lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-brand-line bg-white/70 backdrop-blur-sm">
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
                {palette.length > 0 && (
                  <div>
                    <p className="mb-2 text-eyebrow font-medium text-muted-foreground">
                      {t("palette")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {palette.map((c) => (
                        <div
                          key={c}
                          className="flex items-center gap-2 rounded-full border border-brand-line bg-white px-2 py-1 text-xs"
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
                    <p className="mb-2 text-eyebrow font-medium text-muted-foreground">
                      {t("styleNotes")}
                    </p>
                    <p className="text-sm text-foreground/90">
                      {design.style_notes}
                    </p>
                  </div>
                )}
                {(() => {
                  if (!design) return null;
                  // Only show videos generated from the displayed render.
                  // Legacy videos (parent_id === null) only appear when the
                  // design has a single render, otherwise we can't tell
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
                      <p className="mb-2 text-eyebrow font-medium text-muted-foreground">
                        {t("cinematicPreview")}
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

            {design?.references != null && (
              <InspirationBoard references={design.references} compact />
            )}
          </section>

          {/* Brief facts + proposal */}
          <aside className="lg:col-span-5">
            <div className="space-y-5">
              <div className="rounded-2xl border border-brand-line bg-white/70 p-5 backdrop-blur-sm">
                <p className="mb-3 text-eyebrow font-medium text-muted-foreground">
                  {t("brief")}
                </p>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">{t("eventType")}</dt>
                    <dd className="min-w-0 break-words text-end capitalize">{brief.event_type}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">{t("date")}</dt>
                    <dd className="min-w-0 break-words text-end">{formatBriefDate(brief.event_date)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">{t("venue")}</dt>
                    <dd className="min-w-0 break-words text-end">{brief.venue || t("open")}</dd>
                  </div>
                  {guestsLabel && (
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 text-muted-foreground">{t("expectedGuests")}</dt>
                      <dd className="min-w-0 break-words text-end">{guestsLabel}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">{t("budget")}</dt>
                    <dd className="min-w-0 break-words text-end">{budget > 0 ? f.currency(budget) : t("notShared")}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-brand-line bg-white/70 p-5 backdrop-blur-sm">
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
                      {t("anotherPlannerEngaged")}
                    </p>
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() => router.push("/dashboard/planner/marketplace")}
                    >
                      {t("browseOtherBriefs")}
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
  const t = useTranslations("marketplace");
  const f = useFormatters();
  const [editOpen, setEditOpen] = useState(false);

  const statusLabel: Record<string, { label: string; className: string }> = {
    pending: {
      label: t("statusStanding"),
      className: "bg-amber-50 text-amber-800 ring-amber-200",
    },
    accepted: {
      label: t("statusAccepted"),
      className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    },
    released: {
      label: t("statusReleased"),
      className: "bg-stone-100 text-stone-700 ring-stone-200",
    },
    declined: {
      label: t("statusWithdrawn"),
      className: "bg-stone-100 text-muted-foreground ring-stone-200",
    },
  };
  const s = statusLabel[proposal.status] ?? statusLabel.pending;
  const amount = decimalToNumber(proposal.quote_amount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-eyebrow font-medium text-muted-foreground">
          {t("yourProposal")}
        </p>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${s.className}`}
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
            <div className="overflow-hidden rounded-xl border border-brand-line bg-white/60">
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-eyebrow font-medium text-muted-foreground">
                  {t("quote")}
                </span>
                <span className="font-display text-xl font-light tracking-tight">
                  {f.currency(amount, proposal.quote_currency)}
                </span>
              </div>
              {breakdown.length > 0 && (
                <div className="border-t border-brand-line bg-rose-50/30 px-3 py-2">
                  <p className="mb-1.5 text-eyebrow font-medium text-rose-700/80">
                    {t("breakdown")}
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
      <div>
        <p className="mb-1 text-eyebrow font-medium text-muted-foreground">
          {t("coverLetter")}
        </p>
        <p className="whitespace-pre-wrap text-sm text-foreground/90">
          {proposal.cover_letter}
        </p>
      </div>
      {proposal.status === "pending" && (
        <div className="flex flex-col gap-2 pt-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger render={<Button variant="outline" />}>
              {t("editProposal")}
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display text-xl font-light tracking-tight">
                  {t("editYourProposal")}
                </DialogTitle>
                <DialogDescription>
                  {t("editProposalDesc")}
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
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="me-2 size-4" />
            )}
            {t("withdrawProposal")}
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
  const t = useTranslations("marketplace");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="text-center">
        <p className="mb-3 text-eyebrow font-medium text-muted-foreground">
          {t("submitProposal")}
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("submitProposalBody")}
        </p>
        <DialogTrigger
          render={
            <Button className="bg-brand-gradient text-white" />
          }
        >
          <Send className="me-2 size-4" />
          {t("writeProposal")}
        </DialogTrigger>
      </div>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-light tracking-tight">
            {t("proposeFor", { title: eventTitle })}
          </DialogTitle>
          <DialogDescription>
            {t("proposeDesc")}
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

const PLANNER_FORM_DEFAULT_FEE_PCT = 8;

function makeTemplateRows(
  template: string,
  total: number,
  defaultLabels: string[],
  installmentN: (n: number) => string,
): InstallmentRow[] {
  const fractions = PLAN_TEMPLATES[template];
  if (!fractions || total <= 0) return [];
  return fractions.map((f, i) => ({
    label: defaultLabels[i] ?? installmentN(i + 1),
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
  const t = useTranslations("marketplace");
  const f = useFormatters();
  const installmentN = (n: number) => t("installmentN", { n });
  const DEFAULT_LABELS = [
    t("deposit"),
    t("midEvent"),
    t("final"),
    t("final"),
  ];
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
    setInstallments(makeTemplateRows(template, total, DEFAULT_LABELS, installmentN));
    // We deliberately omit `installments` from deps, including it would
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
    onError: (e) =>
      toast.error(t("scheduleSaveFailed", { message: e.message })),
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
      toast.error(t("setQuoteFirst"));
      setInstallments([]);
      return;
    }
    setInstallments(makeTemplateRows(name, total, DEFAULT_LABELS, installmentN));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (coverLetter.trim().length < 20) {
      toast.error(t("coverLetterTooShort"));
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
          t("planMismatch", { sum, quote: quoteAmount }),
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

      toast.success(
        mode === "create" ? t("proposalSent") : t("proposalUpdated"),
      );
      utils.paymentSchedules.forEvent.invalidate();
      onDone();
    } catch {
      // toasts already surfaced from per-mutation onError
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cover">{t("coverLetter")}</Label>
        <Textarea
          id="cover"
          rows={6}
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          placeholder={t("coverLetterPlaceholder")}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">
          {coverLetter.length}/5000
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="quote">{t("quoteOptional")}</Label>
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
          <Label htmlFor="currency">{t("currency")}</Label>
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
          <Label>{t("breakdownOptional")}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setBreakdown((rows) => [...rows, { label: "", amount: "" }])
            }
          >
            {t("addRow")}
          </Button>
        </div>
        {breakdown.map((row, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-7"
              placeholder={t("decorFlorals")}
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

      <div className="space-y-3 rounded-2xl border border-brand-line bg-rose-50/40 p-4">
        <div>
          <Label className="text-sm">{t("paymentPlan")}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("paymentPlanDesc")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["50/50", "30/40/30", "25/25/25/25", "custom"] as const).map(
            (key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={template === key ? "default" : "outline"}
                onClick={() => applyTemplate(key)}
                className={
                  template === key
                    ? "h-7 bg-brand-gradient text-white"
                    : "h-7"
                }
              >
                {key === "custom" ? t("custom") : key}
              </Button>
            )
          )}
          {installments.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setInstallments([])}
              className="h-7 ms-auto text-muted-foreground hover:text-rose-700"
            >
              {t("clear")}
            </Button>
          )}
        </div>

        {installments.map((row, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-5"
              placeholder={t("deposit")}
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
                  label:
                    DEFAULT_LABELS[rows.length] ?? installmentN(rows.length + 1),
                  amount: "",
                  due_date: "",
                },
              ])
            }
          >
            {t("addInstallment")}
          </Button>
        )}

        {installmentTotal > 0 && (
          <div className="rounded-xl border border-brand-line bg-white/80 px-3 py-2 text-xs">
            <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
              {t("takeHomePreview")}
            </p>
            <ul className="space-y-0.5">
              <li className="flex justify-between">
                <span className="text-muted-foreground">{t("clientPays")}</span>
                <span className="font-mono tabular-nums">
                  {f.currency(installmentTotal, currency)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("platformFee", { pct: PLANNER_FORM_DEFAULT_FEE_PCT })}
                </span>
                <span className="font-mono tabular-nums text-foreground/70">
                  − {f.currency(feeAmount, currency)}
                </span>
              </li>
              <li className="flex justify-between border-t border-brand-line pt-1 font-medium">
                <span>{t("yourTakeHome")}</span>
                <span className="font-mono tabular-nums">
                  {f.currency(takeHome, currency)}
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
          className="bg-brand-gradient text-white"
        >
          {submitting ? (
            <Loader2 className="me-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="me-2 size-4" />
          )}
          {mode === "create" ? t("sendProposal") : t("saveChanges")}
        </Button>
      </div>
    </form>
  );
}
