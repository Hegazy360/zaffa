"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  Loader2,
  Calendar,
  Image as ImageIcon,
  Film,
  FileText,
  Globe,
  Users,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PACK_SKU,
  PACK_SKUS,
  PURCHASABLE_PACK_SKUS,
  VISION_PACK_DEFAULT_PLATFORM_FEE_PCT,
  type PackSkuId,
} from "@/lib/vision-pack";
import { useTierPricing } from "./use-pricing";
import { VisionPackUpgradeCta } from "./VisionPackUpgradeCta";
import { usePackCheckoutAction } from "./use-pack-checkout-action";

interface PackCheckoutPanelProps {
  /** Pre-select a tier; defaults to the entry-tier Design Pack. */
  defaultSku?: PackSkuId;
  /** Optional path to bounce back to after Stripe success/cancel. */
  returnPath?: string;
  /**
   * Optional cancel/dismiss handler. When provided, renders a ghost
   * "Not now" button alongside the primary CTA — used by the modal
   * variant to give visitors an escape hatch. Inline usages typically
   * omit this; the visitor can just navigate away.
   */
  onCancel?: () => void;
  /**
   * Pre-resolved heading text (eyebrow + title + body) to render above
   * the picker. When the panel is rendered inside the paywall dialog,
   * the dialog supplies its own `DialogTitle`/`DialogDescription` and
   * passes `null` here so we don't double up. When rendered inline
   * (e.g. on `/r/[renderId]`) the host page passes copy via this prop.
   */
  heading?: {
    eyebrow?: string;
    title: string;
    body: string;
  } | null;
}

/**
 * The buyable surface of a Vision Pack: tier picker, what's included
 * for the selected tier, stacking/refund note, and the buy CTA.
 *
 * Used in two contexts:
 *   - Inside `VisionPackPaywall` as the modal body, with the dialog
 *     supplying its own headline (so `heading` is `null`).
 *   - On `/r/[renderId]` as an inline checkout panel — host page
 *     supplies a `heading` and there's no `onCancel` (no modal to
 *     close).
 *
 * Selection state lives in the panel itself, so flipping between
 * tiers updates the includes list + CTA price label without bouncing
 * through a parent.
 */
export function PackCheckoutPanel({
  defaultSku,
  returnPath,
  onCancel,
  heading,
}: PackCheckoutPanelProps) {
  const t = useTranslations("visionPack");
  const tm = useTranslations("marketing");
  const [selectedSku, setSelectedSku] = useState<PackSkuId>(
    defaultSku ?? DEFAULT_PACK_SKU,
  );
  const tierPricing = useTierPricing();
  const sku = PACK_SKUS[selectedSku];
  const skuPrice = tierPricing.bySku[selectedSku];
  const { buy, isPending, isAnon } = usePackCheckoutAction({ returnPath });

  return (
    <div className="flex flex-col">
      {heading ? (
        <div className="px-6 pt-6 pb-2">
          {heading.eyebrow ? (
            <div className="text-[10px] font-semibold tracking-[0.2em] text-rose-700 uppercase dark:text-rose-300">
              {heading.eyebrow}
            </div>
          ) : null}
          <h2 className="font-display mt-2 text-2xl font-light tracking-tight leading-tight sm:text-3xl">
            {heading.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {heading.body}
          </p>
        </div>
      ) : null}

      {/* Upgrade CTA — only renders when the caller already owns the
          lower paid tier and a higher tier is available. Surfaces
          before the tier picker so the delta-priced path takes
          precedence over a fresh purchase the server would reject
          anyway. */}
      <div className="px-6 pt-5 empty:hidden">
        <VisionPackUpgradeCta returnPath={returnPath} />
      </div>

      {/* Tier picker — two cards, click to select. Order matches
          `PACK_SKU_ORDER` so the lower tier reads first. */}
      <div className="grid grid-cols-2 gap-2 px-6 pt-5">
        {PURCHASABLE_PACK_SKUS.map((id) => {
          const price = tierPricing.bySku[id];
          const active = id === selectedSku;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedSku(id)}
              aria-pressed={active}
              aria-label={tm(`tier.${id}.eyebrow`)}
              className={
                "group rounded-xl border p-3 text-start transition-all " +
                (active
                  ? "border-rose-400 bg-rose-50/60 shadow-sm ring-1 ring-rose-300 dark:border-rose-700 dark:bg-rose-950/30 dark:ring-rose-700"
                  : "border-rose-100 bg-background hover:border-rose-200 dark:border-rose-900/40 dark:hover:border-rose-800")
              }
            >
              <div className="text-[10px] font-semibold tracking-[0.18em] text-rose-700 uppercase dark:text-rose-300">
                {tm(`tier.${id}.eyebrow`)}
              </div>
              <div className="mt-1 font-display text-lg font-light tracking-tight">
                {price.label}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
                {tm(`tier.${id}.tagline`)}
              </div>
            </button>
          );
        })}
      </div>

      {/* What's included — derived from the selected SKU's quotas and
          capability flags so adding a tier doesn't require any edits
          here. */}
      <div className="px-6 py-5">
        <div className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase mb-3">
          {t("includesEyebrow")}
        </div>
        <ul className="space-y-2.5 text-sm">
          <PackInclude icon={ImageIcon} text={t("includesMoodboard")} />
          <PackInclude
            icon={ImageIcon}
            text={t("includesRenders", {
              count: sku.quotas.renders,
              styles: sku.quotas.styles,
            })}
          />
          {sku.quotas.videos > 0 ? (
            <PackInclude
              icon={Film}
              text={t("includesVideos", { count: sku.quotas.videos })}
            />
          ) : null}
          <PackInclude icon={FileText} text={t("includesLookbook")} />
          <PackInclude icon={Globe} text={t("includesMicrosite")} />
          {sku.includesVenueRecs ? (
            <PackInclude
              icon={Building2}
              text={tm(`tier.${sku.id}.venueRecsBullet`)}
            />
          ) : null}
          {sku.includesPlannerMatch ? (
            <PackInclude
              icon={Users}
              text={tm(`tier.${sku.id}.plannerBullet`)}
            />
          ) : null}
          <PackInclude
            icon={Calendar}
            text={t("includesWindow", { days: sku.durationDays })}
          />
        </ul>
      </div>

      {/* Stacking note + refund. Only relevant when planner match is
          part of the selected tier — Design Pack is a flat one-off
          with no marketplace fee. */}
      <div className="px-6 py-4 border-t border-rose-100/70 bg-muted/30 text-xs text-muted-foreground leading-relaxed dark:border-rose-900/40">
        {sku.includesPlannerMatch ? (
          <p>
            {t("stackingNote", {
              pct: VISION_PACK_DEFAULT_PLATFORM_FEE_PCT,
              price: skuPrice.label,
            })}
          </p>
        ) : (
          <p>{tm(`tier.${sku.id}.flatNote`, { price: skuPrice.label })}</p>
        )}
        <p className="mt-2 font-medium text-foreground/80">
          {t("refundPolicyShort")}
        </p>
      </div>

      {/* CTA row. Anon visitors get bounced through the classic signup
          page (see `handleBuyClick`); permanent users go straight to
          Stripe. The label adapts so the visitor knows what'll happen
          next. */}
      <div className="px-6 py-4 border-t border-rose-100/70 bg-background dark:border-rose-900/40 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            {t("paywallNotNow")}
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="lg"
          disabled={isPending}
          onClick={() => buy(selectedSku)}
          className="h-11 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-5 text-white shadow-lg shadow-rose-500/20 hover:opacity-90"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("checkoutLoading")}
            </>
          ) : isAnon ? (
            t("paywallCtaSignupThenPay", { price: skuPrice.label })
          ) : (
            t("paywallCta", { price: skuPrice.label })
          )}
        </Button>
      </div>
    </div>
  );
}

function PackInclude({
  icon: Icon,
  text,
}: {
  icon: typeof Check;
  text: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
        <Icon className="size-3" />
      </span>
      <span className="text-foreground/85 leading-relaxed">{text}</span>
    </li>
  );
}
