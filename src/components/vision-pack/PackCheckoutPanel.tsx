"use client";

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
  VISION_PACK_DEFAULT_PLATFORM_FEE_PCT,
  type PackSkuId,
} from "@/lib/vision-pack";
import { useTierPricing } from "./use-pricing";
import { usePackCheckoutAction } from "./use-pack-checkout-action";

interface PackCheckoutPanelProps {
  /** Pre-select a tier; defaults to the entry-tier Design Pack. */
  defaultSku?: PackSkuId;
  /** Optional path to bounce back to after Stripe success/cancel. */
  returnPath?: string;
  /**
   * Optional cancel/dismiss handler. When provided, renders a ghost
   * "Not now" button alongside the primary CTA, used by the modal
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
 * The buyable surface of the pack: summary card, what's included,
 * refund note, and the buy CTA. One purchasable SKU, so there is no
 * picker, nothing should look choosable when there's no choice.
 *
 * Used in two contexts:
 *   - Inside `VisionPackPaywall` as the modal body, with the dialog
 *     supplying its own headline (so `heading` is `null`).
 *   - On `/r/[renderId]` as an inline checkout panel, host page
 *     supplies a `heading` and there's no `onCancel` (no modal to
 *     close).
 */
export function PackCheckoutPanel({
  defaultSku,
  returnPath,
  onCancel,
  heading,
}: PackCheckoutPanelProps) {
  const t = useTranslations("visionPack");
  const tm = useTranslations("marketing");
  // No selection state: one purchasable pack. `defaultSku` survives in the
  // prop signature so historic callers keep compiling, but it can only
  // resolve to the one entry in PURCHASABLE_PACK_SKUS.
  const selectedSku: PackSkuId = defaultSku ?? DEFAULT_PACK_SKU;
  const tierPricing = useTierPricing();
  const sku = PACK_SKUS[selectedSku];
  const skuPrice = tierPricing.bySku[selectedSku];
  const { buy, isPending, isAnon } = usePackCheckoutAction({ returnPath });

  return (
    <div className="flex flex-col">
      {heading ? (
        <div className="px-6 pt-6 pb-2">
          {heading.eyebrow ? (
            <div className="text-eyebrow font-semibold text-rose-700">
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

      {/* One pack, not a picker. When the tiers consolidated
          (ZAF-77/78) the two-card selector collapsed to a summary card:
          there is nothing to choose, so nothing should look choosable. */}
      <div className="px-6 pt-5">
        <div className="rounded-xl border border-rose-400 bg-rose-50/60 p-4 shadow-sm ring-1 ring-rose-300">
          <div className="text-eyebrow font-semibold text-rose-700">
            {tm(`tier.${selectedSku}.eyebrow`)}
          </div>
          <div className="mt-1 font-display text-2xl font-light tracking-tight">
            {skuPrice.label}
          </div>
          <div className="mt-1 text-xs text-muted-foreground leading-snug">
            {tm(`tier.${selectedSku}.tagline`)}
          </div>
        </div>
      </div>

      {/* What's included, derived from the selected SKU's quotas and
          capability flags so adding a tier doesn't require any edits
          here. */}
      <div className="px-6 py-5">
        <div className="text-eyebrow font-semibold text-muted-foreground mb-3">
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
          part of the selected tier, Design Pack is a flat one-off
          with no marketplace fee. */}
      <div className="px-6 py-4 border-t border-brand-line bg-muted/30 text-xs text-muted-foreground leading-relaxed">
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
      <div className="px-6 py-4 border-t border-brand-line bg-background flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          className="h-11 gap-2 bg-brand-gradient px-5 text-white shadow-glow hover:opacity-90"
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
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
        <Icon className="size-3" />
      </span>
      <span className="text-foreground/85 leading-relaxed">{text}</span>
    </li>
  );
}
