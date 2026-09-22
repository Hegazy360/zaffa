"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_PACK_SKU,
  FREE_PACK_SKU_ID,
  PACK_SKUS,
  isFreePack,
  type PackSkuId,
} from "@/lib/vision-pack";
import { trpc } from "@/lib/trpc";
import { useTierPricing } from "./use-pricing";
import { formatPriceLabel } from "@/lib/vision-pack-pricing";
import { PackCheckoutPanel } from "./PackCheckoutPanel";
import type { PackErrorReason } from "./pack-error";

/**
 * Headline and body per paywall reason. A total Record so adding a reason
 * to `PACK_ERROR_REASONS` is a compile error here until it has copy.
 */
const REASON_COPY: Record<
  PackErrorReason,
  {
    title:
      | "paywallTitle"
      | "quotaExhaustedTitle"
      | "quotaEditsTitle"
      | "windowExpiredTitle"
      | "rateLimitedFreeTitle";
    body:
      | "paywallBody"
      | "quotaExhaustedBody"
      | "quotaEditsBody"
      | "windowExpiredBody"
      | "rateLimitedFreeBody";
  }
> = {
  PACK_REQUIRED: { title: "paywallTitle", body: "paywallBody" },
  PACK_QUOTA_RENDERS: { title: "quotaExhaustedTitle", body: "quotaExhaustedBody" },
  PACK_QUOTA_VIDEOS: { title: "quotaExhaustedTitle", body: "quotaExhaustedBody" },
  PACK_QUOTA_EDITS: { title: "quotaEditsTitle", body: "quotaEditsBody" },
  PACK_WINDOW_EXPIRED: { title: "windowExpiredTitle", body: "windowExpiredBody" },
  FREE_RENDER_RATE_LIMITED: {
    title: "rateLimitedFreeTitle",
    body: "rateLimitedFreeBody",
  },
};

interface VisionPackPaywallProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Why the paywall is open. Drives the headline copy:
   *  - REQUIRED          -> "Unlock generation" (default, never bought)
   *  - QUOTA_RENDERS     -> "You've used all your renders"
   *  - QUOTA_VIDEOS      -> "You've used all your videos"
   *  - QUOTA_EDITS       -> "You've used all your design changes"
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
 * scrollable body) and delegates the actual buyable surface, tier
 * picker, what's included, stacking note, CTA - to
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
  // flip selection, this is just the lead-in.
  const previewPrice = tierPricing.bySku[defaultSku ?? "wedding_design_pack_v1"];
  // Edit allowances come from the registry so the copy can never promise a
  // number the pack does not stamp. Passed as strings so the digits stay
  // Latin whatever the ICU layer does with numbers: this is a money
  // surface, and Arabic money surfaces keep Latin digits.
  const freeEdits = String(PACK_SKUS[FREE_PACK_SKU_ID].quotas.edits);
  const packEdits = String(PACK_SKUS[defaultSku ?? DEFAULT_PACK_SKU].quotas.edits);

  // Running out of edits reads differently on a paid pack: "the Design Pack
  // gives you 60 more" is false to someone who already bought it and spent
  // them. Only this reason needs to know the tier, so the pack is fetched
  // only while it is showing (the designer has it cached already, and an
  // edit is always made by a signed-in session, anonymous or not).
  const editsReason = open && reason === "PACK_QUOTA_EDITS";
  const { data: currentPack } = trpc.visionPacks.current.useQuery(undefined, {
    enabled: editsReason,
  });
  const paidPackOutOfEdits =
    editsReason && !!currentPack && !isFreePack(currentPack.sku);

  const { title: titleKey, body: reasonBodyKey } =
    REASON_COPY[reason ?? "PACK_REQUIRED"];
  const bodyKey = paidPackOutOfEdits ? "quotaEditsPaidBody" : reasonBodyKey;
  const packEditsUsed = String(currentPack?.edits_quota ?? packEdits);

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
        {/* Hero band, mirrors the email template eyebrow + headline */}
        <div className="relative bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60 px-6 pt-7 pb-5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-white/80 px-3 py-1 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
            <Sparkles className="size-3" />
            {t("name")}
          </div>
          <DialogTitle className="font-display mt-3 text-2xl font-light tracking-tight leading-tight">
            {t(titleKey)}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {t(bodyKey, {
              price: previewPrice.label,
              freeEdits,
              packEdits,
              editsQuota: packEditsUsed,
            })}
          </DialogDescription>
        </div>

        {/* Scrollable body. `min-h-0` is required so the grid's 1fr row
            can actually shrink below its content's intrinsic height -
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
