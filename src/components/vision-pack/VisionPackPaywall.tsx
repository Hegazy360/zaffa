"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { type PackSkuId } from "@/lib/vision-pack";
import { useTierPricing } from "./use-pricing";
import { formatPriceLabel } from "@/lib/vision-pack-pricing";
import { PackCheckoutPanel } from "./PackCheckoutPanel";
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
 *
 * Owns the dialog chrome (hero band with reason-driven headline +
 * scrollable body) and delegates the actual buyable surface — tier
 * picker, what's included, stacking note, CTA — to
 * `PackCheckoutPanel`. The same panel is rendered inline on
 * `/r/[renderId]` so we don't have two parallel implementations of the
 * "buy a pack" UX drifting apart.
 *
 * Triggered from anywhere via the `usePackPaywall()` context.
 */
export function VisionPackPaywall({
  open,
  onOpenChange,
  reason,
  returnPath,
  defaultSku,
}: VisionPackPaywallProps) {
  const t = useTranslations("visionPack");
  const tierPricing = useTierPricing();
  // The body copy embeds a price for the default tier (so the headline
  // mentions a concrete amount). The picker inside the panel can still
  // flip selection — this is just the lead-in.
  const previewPrice = tierPricing.bySku[defaultSku ?? "wedding_design_pack_v1"];

  const titleKey =
    reason === "PACK_QUOTA_RENDERS" || reason === "PACK_QUOTA_VIDEOS"
      ? "quotaExhaustedTitle"
      : reason === "PACK_WINDOW_EXPIRED"
        ? "windowExpiredTitle"
        : reason === "FREE_RENDER_RATE_LIMITED"
          ? "rateLimitedFreeTitle"
          : "paywallTitle";
  const bodyKey =
    reason === "PACK_QUOTA_RENDERS" || reason === "PACK_QUOTA_VIDEOS"
      ? "quotaExhaustedBody"
      : reason === "PACK_WINDOW_EXPIRED"
        ? "windowExpiredBody"
        : reason === "FREE_RENDER_RATE_LIMITED"
          ? "rateLimitedFreeBody"
          : "paywallBody";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Three-row layout: hero (auto) / scrollable body (1fr) / nothing.
        The CTA lives at the bottom of the panel itself (it adapts to
        either modal or inline usage), so the dialog just provides the
        viewport-fit container and headline band.

        Capping the dialog at `100dvh-2rem` keeps it inside the viewport
        on mobile (where the iOS URL bar would otherwise eat the bottom
        of a plain `100vh` calc), while the inner body row owns the
        scrolling so the CTA stays pinned and visible at every height.
      */}
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden grid-rows-[auto_1fr] max-h-[calc(100dvh-2rem)]">
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
            {t(bodyKey, { price: previewPrice.label })}
          </DialogDescription>
        </div>

        {/* Scrollable body. `min-h-0` is required so the grid's 1fr row
            can actually shrink below its content's intrinsic height —
            without it `overflow-y-auto` is a no-op. */}
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <PackCheckoutPanel
            defaultSku={defaultSku}
            returnPath={returnPath}
            onCancel={() => onOpenChange(false)}
            heading={null}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-export the formatter for callers that still want a one-shot label
// without going through the hook (e.g. server components).
export { formatPriceLabel };
