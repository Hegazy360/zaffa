"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_PACK_SKU,
  PACK_SKU_ORDER,
  type PackSkuId,
} from "@/lib/vision-pack";
import {
  type VisionPackPrice,
  formatPriceLabel,
  seedPricingFor,
} from "@/lib/vision-pack-pricing";

export interface TierPrice {
  amount: number;
  currency: string;
  /** Pre-formatted display string (e.g. "EGP 499", "$19.99", "€89"). */
  label: string;
}

/**
 * Client-side hook returning the visitor's resolved Vision Pack price
 * for the **lower-tier Design Pack** (the entry tier quoted on the
 * marketing surface). Falls back to the seed default ($19.99 USD) while
 * the tRPC query is loading so the UI never flashes a naked "{price}"
 * placeholder.
 *
 * For surfaces that need both tiers (paywall, comparison block) use
 * `useTierPricing` below — it shares the same underlying query so we
 * never round-trip twice on the same page.
 */
export function useVisionPackPricing(): {
  amount: number;
  currency: string;
  /** Two-letter ISO code from geo signal, or null when unknown. */
  country: string | null;
  /** Pre-formatted display string (e.g. "EGP 99", "$19.99"). */
  label: string;
  isLoading: boolean;
} {
  const tier = useTierPricing(DEFAULT_PACK_SKU);
  const price = tier.bySku[DEFAULT_PACK_SKU];
  return {
    amount: price.amount,
    currency: price.currency,
    country: tier.country,
    label: price.label,
    isLoading: tier.isLoading,
  };
}

/**
 * Returns every tier's price for the visitor's market in a single query.
 * Use on home + paywall + comparison surfaces. The optional argument
 * pre-selects a focus tier but every SKU's price is always available
 * via `bySku`.
 */
export function useTierPricing(_focus: PackSkuId = DEFAULT_PACK_SKU): {
  /** Resolved per-tier prices, keyed by SKU. Always populated; falls back
   *  to seed prices while the tRPC query is loading. */
  bySku: Record<PackSkuId, TierPrice>;
  /** Tier prices in display order (lowest → highest tier). */
  ordered: Array<{ sku: PackSkuId } & TierPrice>;
  country: string | null;
  isLoading: boolean;
} {
  const locale = useLocale();
  const { data, isLoading } = trpc.visionPacks.pricing.useQuery(
    {},
    {
      // Pricing rarely changes mid-session — staleTime caps cross-component
      // refetches when several CTAs render on the same page.
      staleTime: 5 * 60 * 1000,
    },
  );

  const bySku = useMemo(() => {
    const out = {} as Record<PackSkuId, TierPrice>;
    for (const sku of PACK_SKU_ORDER) {
      const fromQuery = data?.tiers.find((t) => t.sku === sku);
      const price: VisionPackPrice = fromQuery
        ? { amount: fromQuery.amount, currency: fromQuery.currency }
        : seedPricingFor(null, sku);
      out[sku] = {
        amount: price.amount,
        currency: price.currency,
        label: formatPriceLabel(price, locale),
      };
    }
    return out;
  }, [data, locale]);

  const ordered = useMemo(
    () => PACK_SKU_ORDER.map((sku) => ({ sku, ...bySku[sku] })),
    [bySku],
  );

  return {
    bySku,
    ordered,
    country: data?.country ?? null,
    isLoading,
  };
}
