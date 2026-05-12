"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sparkles,
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
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_PACK_SKU,
  PACK_SKUS,
  VISION_PACK_DEFAULT_PLATFORM_FEE_PCT,
  type PackSkuId,
} from "@/lib/vision-pack";
import { useTierPricing } from "./use-pricing";
import { formatPriceLabel } from "@/lib/vision-pack-pricing";
import type { PackErrorReason } from "./pack-error";

interface VisionPackPaywallProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Why the paywall is open. Drives the headline copy:
   *  - REQUIRED          -> "Unlock generation" (default — never bought)
   *  - QUOTA_RENDERS     -> "You've used all your renders"
   *  - QUOTA_VIDEOS      -> "You've used all your videos"
   *  - WINDOW_EXPIRED    -> "Your generation window has closed"
   * `null` is treated as REQUIRED.
   */
  reason?: PackErrorReason | null;
  /** Optional path to bounce back to after success/cancel. */
  returnPath?: string;
  /** Pre-select a tier; defaults to the entry-tier Design Pack. */
  defaultSku?: PackSkuId;
}

/**
 * Editorial paywall modal that fronts the entire AI generation surface.
 * Surfaces the value prop (price, what's included, refund policy) and
 * routes to Stripe Checkout. Lives behind `usePackPaywall`-driven state
 * so it can be triggered from anywhere in the designer or marketing
 * surfaces.
 *
 * Two tiers ship today and the paywall lets the visitor pick before
 * checkout. Defaults to the lower-tier Design Pack so the headline
 * price matches the "starting from $19.99" framing on the home page.
 */
export function VisionPackPaywall({
  open,
  onOpenChange,
  reason,
  returnPath,
  defaultSku,
}: VisionPackPaywallProps) {
  const t = useTranslations("visionPack");
  const tm = useTranslations("marketing");
  const [selectedSku, setSelectedSku] = useState<PackSkuId>(
    defaultSku ?? DEFAULT_PACK_SKU,
  );
  const tierPricing = useTierPricing();
  const sku = PACK_SKUS[selectedSku];
  const skuPrice = tierPricing.bySku[selectedSku];

  const checkout = trpc.visionPacks.startCheckout.useMutation({
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (err) => {
      toast.error(err.message || t("checkoutFailed"));
    },
  });

  const titleKey =
    reason === "PACK_QUOTA_RENDERS" || reason === "PACK_QUOTA_VIDEOS"
      ? "quotaExhaustedTitle"
      : reason === "PACK_WINDOW_EXPIRED"
        ? "windowExpiredTitle"
        : "paywallTitle";
  const bodyKey =
    reason === "PACK_QUOTA_RENDERS" || reason === "PACK_QUOTA_VIDEOS"
      ? "quotaExhaustedBody"
      : reason === "PACK_WINDOW_EXPIRED"
        ? "windowExpiredBody"
        : "paywallBody";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Three-row layout: hero (auto) / scrollable body (1fr) / CTA (auto).
        Capping the dialog at `100dvh-2rem` keeps it inside the viewport on
        mobile (where the iOS URL bar would otherwise eat the bottom of a
        plain `100vh` calc), while the inner middle row owns the scrolling
        so the CTA stays pinned and visible at every height.
      */}
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden grid-rows-[auto_1fr_auto] max-h-[calc(100dvh-2rem)]">
        {/* Hero band — mirrors the email template eyebrow + headline */}
        <div className="relative bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60 px-6 pt-7 pb-5 dark:from-rose-950/30 dark:via-background dark:to-amber-950/20">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-white/80 px-3 py-1 text-[10px] font-medium tracking-[0.2em] text-rose-700 uppercase backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
            <Sparkles className="size-3" />
            {t("name")}
          </div>
          <DialogTitle className="font-display mt-3 text-2xl font-light tracking-tight leading-tight">
            {t(titleKey)}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {t(bodyKey, { price: skuPrice.label })}
          </DialogDescription>
        </div>

        {/* Scrollable body. `min-h-0` is required so the grid's 1fr row can
            actually shrink below its content's intrinsic height — without
            it `overflow-y-auto` is a no-op. */}
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {/* Tier picker — two cards, click to select. Order matches
              `PACK_SKU_ORDER` so the lower tier reads first. */}
          <div className="grid grid-cols-2 gap-2 px-6 pt-5">
            {(Object.keys(PACK_SKUS) as PackSkuId[]).map((id) => {
              const meta = PACK_SKUS[id];
              const price = tierPricing.bySku[id];
              const active = id === selectedSku;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedSku(id)}
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

          {/* What's included — derived from the selected SKU's quotas
              and capability flags so adding a tier doesn't require any
              edits here. */}
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
        </div>

        {/* CTA — sits in the third grid row, so it stays pinned at the
            bottom of the dialog regardless of how tall the body grows. */}
        <div className="px-6 py-4 border-t border-rose-100/70 bg-background dark:border-rose-900/40 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={checkout.isPending}
          >
            {t("paywallNotNow")}
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={checkout.isPending}
            onClick={() =>
              checkout.mutate({
                sku: selectedSku,
                ...(returnPath ? { returnPath } : {}),
              })
            }
            className="h-11 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-5 text-white shadow-lg shadow-rose-500/20 hover:opacity-90"
          >
            {checkout.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("checkoutLoading")}
              </>
            ) : (
              t("paywallCta", { price: skuPrice.label })
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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

// Re-export the formatter for callers that still want a one-shot label
// without going through the hook (e.g. server components).
export { formatPriceLabel };
