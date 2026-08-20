"use client";

import { useEffect, useRef } from "react";
import { useVisionPackPricing } from "@/components/vision-pack/use-pricing";
import { ttTrack, TIKTOK_EVENTS } from "@/lib/tiktok";
import { DEFAULT_PACK_SKU } from "@/lib/vision-pack";
import { minorToMajor } from "@/lib/vision-pack-pricing";

/**
 * Fire TikTok ViewContent once per mount. The home-page hero is the
 * canonical pack "product page" surface — TikTok requires this
 * funnel-top event for vertical optimization (else campaigns drop ROAS,
 * see the Events Manager warning). Guarded by a ref so re-renders /
 * pricing refetches don't re-fire. `ttTrack` itself no-ops when
 * NEXT_PUBLIC_TIKTOK_PIXEL_ID is unset, so this is a hard no-op in
 * local dev / tests / CI without the key.
 *
 * Extracted verbatim from the old HeroEditorial when the sample-studio
 * hero replaced it — the event MUST keep firing on `/` whatever the hero
 * looks like.
 */
export function useTikTokViewContent(): void {
  const pricing = useVisionPackPricing();
  const ttFiredRef = useRef(false);
  useEffect(() => {
    if (ttFiredRef.current) return;
    if (pricing.isLoading) return;
    ttFiredRef.current = true;
    const major = minorToMajor(pricing.amount, pricing.currency);
    ttTrack(TIKTOK_EVENTS.VIEW_CONTENT, {
      contents: [
        {
          content_id: DEFAULT_PACK_SKU,
          content_type: "product",
          content_name: "Wedding Design Pack",
          quantity: 1,
          price: major,
        },
      ],
      value: major,
      currency: pricing.currency.toUpperCase(),
    });
  }, [pricing.isLoading, pricing.amount, pricing.currency]);
}
