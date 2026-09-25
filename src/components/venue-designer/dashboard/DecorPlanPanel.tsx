"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  CheckCircle2,
  ChevronDown,
  Info,
  MessageCircleQuestion,
  ReceiptText,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { isFlagEnabled } from "@/lib/flags";
import { useIsAnonymous } from "@/lib/use-is-anonymous";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { formatMoney, moneyLocaleTag } from "@/lib/money-format";
import { REPLY_WITHIN_HOURS } from "@/lib/contact-channels";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ApproveDesignDialog } from "@/components/venue-designer/ApproveDesignDialog";
import {
  FALLBACK_QUESTION_KEYS,
  assumptionMessage,
  detailMessage,
  quantityMessage,
  type DecorMessage,
} from "@/lib/decor-plan-copy";
import type {
  DecorAssumption,
  DecorItemDetail,
  DecorMarket,
  DecorPlan,
  DecorPlanItem,
} from "@/lib/decor-pricing";

// Same look as the step's cards (see `cnStepBody` in VenueDesigner), but a
// plain element: the header is a full-bleed button, and the step body's
// descendant rule would force the Card primitive's vertical padding onto it.
const SURFACE =
  "overflow-hidden rounded-2xl bg-card/85 text-sm text-card-foreground ring-1 ring-foreground/[0.06] shadow-[0_12px_40px_-18px_rgba(244,63,94,0.18)] backdrop-blur-sm";

// Unicode first-strong isolate / pop directional isolate: the plain-text
// twin of <bdi>. A money range is one translated sentence ("من X إلى Y"),
// so the isolates go around each amount inside the string rather than
// around JSX nodes. Built from code points so no invisible character hides
// in the source.
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);
const isolate = (s: string) => `${FSI}${s}${PDI}`;

interface DecorPlanPanelProps {
  designId: string;
  /** The design's render ids, newest first. */
  renderIds: string[];
  /** The design is already with the team (approved), so no quote CTA. */
  approved: boolean;
}

/**
 * F4, "What it takes to build this": the costed decor plan for the render
 * version on screen, under the render panel.
 *
 * The version is the one the render panel has active (shared through the
 * store), else the latest render. Everything shown is computed on the
 * server from a cached read of the render: the model only said what is in
 * the picture, the numbers are code over a sourced price table.
 *
 * A money surface, so the Arabic is فصحى and every number (amounts,
 * quantities, counts) is formatted with Latin digits via `moneyLocaleTag`.
 *
 * Quiet by design: while the first read is running it holds its place with
 * a skeleton (for signed-in couples only, an anonymous visitor may not be
 * allowed a plan yet), and on any error it simply is not there. The server
 * reports the failure; a broken estimate is worse than none.
 */
export function DecorPlanPanel({ designId, renderIds, approved }: DecorPlanPanelProps) {
  const t = useTranslations("decorPlan");
  const locale = useLocale();
  const isAnon = useIsAnonymous();
  const activeId = useVenueDesignerStore((s) => s.activeRenderMediaId);
  const mediaId =
    activeId && renderIds.includes(activeId) ? activeId : (renderIds[0] ?? null);

  const [market, setMarket] = useState<DecorMarket | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const bodyId = useId();

  const enabled = isFlagEnabled("decorPlan") && Boolean(mediaId);
  const query = trpc.decorPlan.forMedia.useQuery(
    {
      mediaId: mediaId ?? "",
      market: market ?? undefined,
      locale: locale as "en" | "ar" | "fr" | "de",
    },
    {
      enabled,
      retry: false,
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // A market switch keeps the current table on screen, dimmed, until
      // the re-priced one lands, instead of flashing back to a skeleton.
      placeholderData: (previous) => previous,
    },
  );

  // "Get exact quotes" opens the approval dialog (F5) pinned to the
  // version this plan priced, so the team quotes what the couple saw.
  const [approveOpen, setApproveOpen] = useState(false);
  // Same query the step above runs, so this is a cache read.
  const { data: design } = trpc.venueDesigns.getById.useQuery({ id: designId });

  const num = useMemo(
    () => new Intl.NumberFormat(moneyLocaleTag(locale), { maximumFractionDigits: 1 }),
    [locale],
  );

  if (!enabled || query.isError) return null;

  const data = query.data;
  if (!data) {
    if (isAnon !== false) return null;
    return (
      <SkeletonRegion label={t("loading")}>
        <div className={SURFACE}>
          <div className="flex items-start gap-3 px-5 py-5 sm:px-7">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-52 max-w-full" />
              <Skeleton className="h-6 w-64 max-w-full" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </div>
      </SkeletonRegion>
    );
  }

  const { plan, questions, markets } = data;
  const money = (amount: number) =>
    isolate(formatMoney(amount, plan.currency, locale));
  const range = (lo: number, hi: number) =>
    t("range", { lo: money(lo), hi: money(hi) });
  const marketName = t(`marketNames.${plan.market}`);
  const updating = query.isPlaceholderData || query.isFetching;

  return (
    <section aria-labelledby={titleId} data-testid="decor-plan">
      <div className={SURFACE}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-start gap-3 px-5 py-5 text-start transition-colors hover:bg-rose-50/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-7"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600"
          >
            <ReceiptText className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span id={titleId} className="block text-base font-semibold text-foreground">
              {t("title")}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("totalLabel")}
            </span>
            <span
              data-testid="decor-plan-total"
              className="mt-0.5 block font-display text-xl leading-snug text-foreground tabular-nums sm:text-2xl"
            >
              {range(plan.totals.lo, plan.totals.hi)}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("forGuests", {
                count: plan.guestCount,
                guests: num.format(plan.guestCount),
              })}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 self-center text-sm font-medium text-rose-700">
            <span className="hidden sm:inline">{open ? t("hidePlan") : t("showPlan")}</span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-5 transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </span>
        </button>

        <div
          id={bodyId}
          hidden={!open}
          aria-busy={updating}
          className="space-y-6 border-t border-rose-100 px-5 pt-5 pb-6 sm:px-7"
        >
          <MarketSwitcher
            markets={markets}
            current={plan.market}
            label={t("currencyLabel")}
            describe={(id) => t(`marketNames.${id}`)}
            onPick={setMarket}
          />

          <div className={cn("transition-opacity", updating && "opacity-60")}>
            <PlanTable plan={plan} range={range} num={num} />
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("disclaimer", { market: marketName })}</span>
          </p>

          <Assumptions plan={plan} num={num} />

          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageCircleQuestion aria-hidden className="size-4 text-rose-500" />
              {t("questionsTitle")}
            </h3>
            <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-sm text-foreground/90 marker:text-rose-500">
              {(questions.length > 0
                ? questions
                : FALLBACK_QUESTION_KEYS.map((key) => t(key))
              ).map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          </div>

          <div className="space-y-2 rounded-xl bg-rose-50/70 p-4">
            {approved ? (
              <p className="flex items-center gap-2 text-sm font-medium text-rose-800">
                <CheckCircle2 aria-hidden className="size-4 shrink-0" />
                {t("quoteAlready")}
              </p>
            ) : isAnon !== false ? (
              // An anonymous couple cannot approve (no contact details yet);
              // the enquiry form collects them and links this design.
              <Button
                variant="cta"
                size="xl"
                className="w-full sm:w-auto"
                render={<Link href={`/enquire?designId=${designId}`} />}
              >
                {t("ctaQuote")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="cta"
                size="xl"
                className="w-full sm:w-auto"
                onClick={() => setApproveOpen(true)}
              >
                {t("ctaQuote")}
              </Button>
            )}
            {isAnon === false ? (
              <ApproveDesignDialog
                open={approveOpen}
                onOpenChange={setApproveOpen}
                designId={designId}
                designName={design?.name ?? ""}
                mediaId={mediaId ?? undefined}
              />
            ) : null}
            {!approved ? (
              <p className="text-xs text-muted-foreground">
                {t("ctaHint", { hours: REPLY_WITHIN_HOURS })}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketSwitcher({
  markets,
  current,
  label,
  describe,
  onPick,
}: {
  markets: Array<{ id: DecorMarket; currency: string }>;
  current: DecorMarket;
  label: string;
  describe: (id: DecorMarket) => string;
  onPick: (id: DecorMarket) => void;
}) {
  const labelId = useId();
  return (
    <div className="space-y-2">
      <p id={labelId} className="text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {markets.map((m) => {
          const active = m.id === current;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              data-market={m.id}
              title={describe(m.id)}
              onClick={() => onPick(m.id)}
              className={cn(
                "min-h-11 min-w-14 rounded-full border px-3 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "border-rose-500 bg-rose-600 text-white"
                  : "border-border bg-background text-foreground hover:bg-rose-50",
              )}
            >
              {/* Currency codes stay Latin in every locale: they are what a
                  quote or a bank statement shows. */}
              <span dir="ltr">{m.currency}</span>
              <span className="sr-only">, {describe(m.id)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlanTable({
  plan,
  range,
  num,
}: {
  plan: DecorPlan;
  range: (lo: number, hi: number) => string;
  num: Intl.NumberFormat;
}) {
  const t = useTranslations("decorPlan");
  const locale = useLocale();
  const list = useMemo(
    () => new Intl.ListFormat(locale, { style: "short", type: "unit" }),
    [locale],
  );

  const say = ({ key, values }: DecorMessage) => t(key, values);
  const qtyLabel = (item: DecorPlanItem) => say(quantityMessage(item, num.format));
  const detailLabel = (d: DecorItemDetail) => say(detailMessage(d));

  // A real table from `sm` up. On a phone each row stacks (name on top,
  // quantity and range below): explicit roles keep the table semantics
  // that a `display: grid` row would otherwise lose.
  return (
    <table role="table" className="w-full border-collapse text-sm">
      <thead role="rowgroup" className="max-sm:sr-only">
        <tr role="row" className="border-b border-rose-100 text-xs text-muted-foreground">
          <th role="columnheader" scope="col" className="pb-2 text-start font-medium">
            {t("columnItem")}
          </th>
          <th role="columnheader" scope="col" className="pb-2 text-end font-medium">
            {t("columnQty")}
          </th>
          <th role="columnheader" scope="col" className="pb-2 text-end font-medium">
            {t("columnRange")}
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup" className="divide-y divide-rose-100/80">
        {plan.items.map((item) => (
          <tr
            role="row"
            key={item.key}
            data-item={item.key}
            className="max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:gap-x-3 max-sm:gap-y-1 max-sm:py-3"
          >
            <th
              role="rowheader"
              scope="row"
              className="py-3 pe-3 text-start align-top font-medium text-foreground max-sm:col-span-2 max-sm:py-0"
            >
              {t(`items.${item.key}`)}
              {item.details.length > 0 ? (
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  {list.format(item.details.map(detailLabel))}
                </span>
              ) : null}
            </th>
            <td
              role="cell"
              className="py-3 pe-3 text-end align-top whitespace-nowrap text-muted-foreground tabular-nums max-sm:py-0 max-sm:text-start"
            >
              {qtyLabel(item)}
            </td>
            <td
              role="cell"
              className="py-3 text-end align-top whitespace-nowrap text-foreground tabular-nums max-sm:py-0"
            >
              {range(item.lo, item.hi)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot role="rowgroup">
        <tr
          role="row"
          className="border-t-2 border-rose-200 max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:pt-3"
        >
          <th
            role="rowheader"
            scope="row"
            colSpan={2}
            className="pt-3 text-start font-semibold text-foreground max-sm:pt-0"
          >
            {t("total")}
          </th>
          <td
            role="cell"
            data-testid="decor-plan-table-total"
            className="pt-3 text-end font-semibold whitespace-nowrap text-foreground tabular-nums max-sm:pt-0"
          >
            {range(plan.totals.lo, plan.totals.hi)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function Assumptions({ plan, num }: { plan: DecorPlan; num: Intl.NumberFormat }) {
  const t = useTranslations("decorPlan");
  const text = (key: DecorAssumption) => {
    const message = assumptionMessage(key, plan, num.format);
    return t(message.key, message.values);
  };
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{t("assumptionsTitle")}</h3>
      <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm text-muted-foreground marker:text-rose-300">
        {plan.assumptions.map((key) => (
          <li key={key}>{text(key)}</li>
        ))}
      </ul>
    </div>
  );
}
