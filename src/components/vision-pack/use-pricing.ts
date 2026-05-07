"use client";

import { useLocale } from "next-intl";
import { trpc } from "@/lib/trpc";
import {
  type VisionPackPrice,
  formatPriceLabel,
  seedPricingFor,
} from "@/lib/vision-pack-pricing";

/**
 * Client-side hook that returns the visitor's resolved Vision Pack
 * price + a localized display label. Falls back to the seed default
 * (USD 99) while the tRPC query is loading so the UI never flashes a
 * naked "{price}" placeholder.
 *
 * Use `label` for headlines/CTAs, and `amount` + `currency` if you need
 * the raw values (e.g. analytics, comparison logic).
 */
export function useVisionPackPricing(): {
  amount: number;
  currency: string;
  /** Two-letter ISO code from geo signal, or null when unknown. */
  country: string | null;
  /** Pre-formatted display string (e.g. "EGP 499", "$99", "€89"). */
  label: string;
  isLoading: boolean;
} {
  const locale = useLocale();
  const { data, isLoading } = trpc.visionPacks.pricing.useQuery(undefined, {
    // Pricing rarely changes mid-session — staleTime caps cross-component
    // refetches when several CTAs render on the same page.
    staleTime: 5 * 60 * 1000,
  });
  const price: VisionPackPrice = data
    ? { amount: data.amount, currency: data.currency }
    : seedPricingFor(null);
  return {
    amount: price.amount,
    currency: price.currency,
    country: data?.country ?? null,
    label: formatPriceLabel(price, locale),
    isLoading,
  };
}
