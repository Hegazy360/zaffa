"use client";

import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Calendar,
  Check,
  Loader2,
  Image as ImageIcon,
  Film,
  FileText,
  Globe,
  Users,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PACK_SKUS,
  VISION_PACK_DEFAULT_PLATFORM_FEE_PCT,
  type PackSkuId,
} from "@/lib/vision-pack";
import { useTierPricing } from "./use-pricing";
import { usePackCheckoutAction } from "./use-pack-checkout-action";

interface PackCheckoutCardProps {
  sku: PackSkuId;
  /** Optional path to bounce back to after Stripe success/cancel. */
  returnPath?: string;
  /**
   * Highlight the card as the recommended option — adds a "Most
   * popular" ribbon, a gradient border, and uses the filled gradient
   * CTA. Other cards get the outlined variant. Set true for the
   * higher-value tier on comparison surfaces.
   */
  featured?: boolean;
}

/**
 * Single-tier upsell card: full price, what's-included list,
 * stacking/refund note, and a dedicated CTA wired to the same
 * checkout pipeline as the paywall modal. Used on `/r/[renderId]` to
 * present both packs side-by-side so visitors can commit in one click
 * instead of opening a modal and picking again.
 *
 * Reaches for `usePackCheckoutAction` for the buy logic so the
 * anon-routing + ANONYMOUS_NOT_ALLOWED fallback stay in lockstep with
 * the modal's CTA.
 */
export function PackCheckoutCard({
  sku,
  returnPath,
  featured = false,
}: PackCheckoutCardProps) {
  const t = useTranslations("visionPack");
  const tm = useTranslations("marketing");
  const meta = PACK_SKUS[sku];
  const price = useTierPricing().bySku[sku];
  const { buy, isPending, isAnon } = usePackCheckoutAction({ returnPath });

  return (
    <div
      className={
        "relative flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg " +
        (featured
          ? "border-rose-300 ring-1 ring-rose-200/80 dark:border-rose-700 dark:ring-rose-900/50"
          : "border-rose-200/70 dark:border-rose-900/40")
      }
    >
      {featured ? (
        <div className="absolute -top-3 start-6 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.15em] text-white uppercase shadow-md">
          {t("featuredBadge")}
        </div>
      ) : null}

      <div className="text-[10px] font-semibold tracking-[0.2em] text-rose-700 uppercase dark:text-rose-300">
        {tm(`tier.${sku}.eyebrow`)}
      </div>
      <div className="mt-2 font-display text-3xl font-light tracking-tight sm:text-4xl">
        {price.label}
      </div>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
        {tm(`tier.${sku}.tagline`)}
      </p>

      <div className="my-5 h-px bg-rose-100/70 dark:bg-rose-900/30" />

      <div className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase mb-3">
        {t("includesEyebrow")}
      </div>
      <ul className="space-y-2.5 text-sm">
        <PackInclude icon={ImageIcon} text={t("includesMoodboard")} />
        <PackInclude
          icon={ImageIcon}
          text={t("includesRenders", {
            count: meta.quotas.renders,
            styles: meta.quotas.styles,
          })}
        />
        {meta.quotas.videos > 0 ? (
          <PackInclude
            icon={Film}
            text={t("includesVideos", { count: meta.quotas.videos })}
          />
        ) : null}
        <PackInclude icon={FileText} text={t("includesLookbook")} />
        <PackInclude icon={Globe} text={t("includesMicrosite")} />
        {meta.includesVenueRecs ? (
          <PackInclude
            icon={Building2}
            text={tm(`tier.${sku}.venueRecsBullet`)}
          />
        ) : null}
        {meta.includesPlannerMatch ? (
          <PackInclude
            icon={Users}
            text={tm(`tier.${sku}.plannerBullet`)}
          />
        ) : null}
        <PackInclude
          icon={Calendar}
          text={t("includesWindow", { days: meta.durationDays })}
        />
      </ul>

      {/* Stacking note: only relevant when planner match is part of
          the tier — entry tier is a flat one-off with no marketplace
          fee. */}
      <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
        {meta.includesPlannerMatch
          ? t("stackingNote", {
              pct: VISION_PACK_DEFAULT_PLATFORM_FEE_PCT,
              price: price.label,
            })
          : tm(`tier.${sku}.flatNote`, { price: price.label })}
      </p>

      {/* Push the CTA to the bottom so both cards line up when the
          includes lists are different lengths. */}
      <div className="mt-6 flex-1" />

      <Button
        type="button"
        size="lg"
        disabled={isPending}
        onClick={() => buy(sku)}
        variant={featured ? "cta" : "outline"}
        className={
          "h-11 gap-2 px-5 " +
          (featured
            ? ""
            : "border-brand-line text-brand-strong hover:bg-brand-tint hover:text-brand-strong")
        }
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("checkoutLoading")}
          </>
        ) : (
          <>
            {isAnon
              ? t("paywallCtaSignupThenPay", { price: price.label })
              : t("paywallCta", { price: price.label })}
            <ArrowRight className="size-4 rtl:-scale-x-100" />
          </>
        )}
      </Button>

      <p className="mt-2 text-center text-[11px] text-muted-foreground/85">
        {t("refundPolicyShort")}
      </p>
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
