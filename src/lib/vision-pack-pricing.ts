// Vision Pack — per-country pricing.
//
// Resolution order (all server-side, in `resolveVisionPackPricing`):
//   1. `vision_pack_pricing[(sku, country_code = <ISO-2 from cookie>)]`
//   2. `vision_pack_pricing[(sku, country_code = 'DEFAULT')]`
//   3. `SEED_PRICING[sku][country]`
//   4. EU expansion → `SEED_PRICING[sku].EU`
//   5. `SEED_PRICING[sku].DEFAULT`
//
// The DB layer is the admin's runtime control surface; the seed is the
// floor that ships with code so a fresh deploy always has a price for
// every country.
//
// IMPORTANT: amounts are stored and passed around in **minor units**
// (cents/piastres). $19.99 is `1999`, EGP 499 is `49900`. This aligns
// with Stripe's smallest-currency-unit convention so the checkout path
// can pass `amount` straight into `unit_amount` without re-multiplying.
// Display helpers handle the divide-by-100 for 2-decimal currencies and
// passthrough for zero-decimal currencies (JPY, KRW, …).

import {
  DEFAULT_PACK_SKU,
  type PackSkuId,
} from "./vision-pack";

export const VISION_PACK_COUNTRY_COOKIE = "zaffa_country";

export interface VisionPackPrice {
  /** Minor-units amount (e.g. 1999 for $19.99, 49900 for 499 EGP). */
  amount: number;
  /** ISO 4217 code (e.g. "EGP", "USD"). */
  currency: string;
}

/**
 * Currencies whose smallest unit equals one major unit (no fractional
 * subdivision). Mirrors `ZERO_DECIMAL_CURRENCIES` in
 * `src/lib/payments.ts`. For these, the DB `amount` IS the major-unit
 * figure — both `formatPriceLabel` and the Stripe path skip the /100.
 */
const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/**
 * Convert a stored minor-units amount into the major-units number used
 * by `Intl.NumberFormat`. e.g. (1999, "USD") -> 19.99; (499, "JPY") -> 499.
 */
export function minorToMajor(amount: number, currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return amount;
  return amount / 100;
}

/** Convenience for tests/seeds that author prices in major units. */
function majorToMinor(amount: number, currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return Math.round(amount);
  return Math.round(amount * 100);
}

type PerCountrySeed = Record<string, VisionPackPrice>;

/**
 * Author the seed in major units for legibility — `99 USD`, `499 EGP` —
 * then convert to the minor-unit storage shape consumers see. Adding a
 * new country: drop another entry in the right SKU bucket; adding a new
 * SKU: add a top-level key here and a matching `PACK_SKUS` entry.
 *
 * 3-decimal currencies (KWD/BHD/OMR/JOD/IQD/LYD/TND) are intentionally
 * routed to USD via the default — Stripe's smallest-unit math for those
 * has rounding constraints (must be a multiple of 10 fils/baisa) that
 * we don't want to encode into a public-pricing seed. Admins can still
 * override per country via the dashboard if needed.
 */
// The free email-gated tier is intentionally absent from this seed —
// it's never sold through Stripe and `seedPricingFor` falls through to
// the Design Pack as the default when an unknown SKU is requested.
// `Partial<Record<PackSkuId, ...>>` lets the type system catch any
// caller that does try to price the free tier.
const SEED_AUTHORED: Partial<Record<PackSkuId, Record<string, { amount: number; currency: string }>>> = {
  // ----- Design Pack — $19 USD default -----
  // Lower-tier "design + microsite + PDF" pack. No planner/venue
  // matching included. Round whole-number retail across all markets
  // so the copy stays clean ("from $19" reads tighter than "from
  // $19.99" on the home page hero). Local equivalents are roughly 5×
  // cheaper than the full Vision Pack to communicate it as the
  // entry point.
  wedding_design_pack_v1: {
    EG: { amount: 99, currency: "EGP" },
    SA: { amount: 99, currency: "SAR" },
    AE: { amount: 99, currency: "AED" },
    QA: { amount: 99, currency: "QAR" },
    GB: { amount: 15, currency: "GBP" },
    EU: { amount: 19, currency: "EUR" },
    US: { amount: 19, currency: "USD" },
    CA: { amount: 19, currency: "USD" },
    DEFAULT: { amount: 19, currency: "USD" },
  },
  // ----- Vision Pack — $99 USD default -----
  // Full pack with planner/venue matching. Same round-retail
  // convention as Design Pack.
  wedding_vision_pack_v1: {
    EG: { amount: 499, currency: "EGP" },
    SA: { amount: 499, currency: "SAR" },
    AE: { amount: 499, currency: "AED" },
    QA: { amount: 499, currency: "QAR" },
    GB: { amount: 79, currency: "GBP" },
    EU: { amount: 89, currency: "EUR" },
    US: { amount: 99, currency: "USD" },
    CA: { amount: 99, currency: "USD" },
    DEFAULT: { amount: 99, currency: "USD" },
  },
};

/**
 * Resolved seed price matrix in **minor units**. `SEED_PRICING[sku][country]`
 * gives the floor when no DB override exists.
 */
export const SEED_PRICING: Partial<Record<PackSkuId, PerCountrySeed>> = Object.fromEntries(
  Object.entries(SEED_AUTHORED).map(([sku, perCountry]) => [
    sku,
    Object.fromEntries(
      Object.entries(perCountry as Record<string, { amount: number; currency: string }>).map(([code, p]) => [
        code,
        { amount: majorToMinor(p.amount, p.currency), currency: p.currency },
      ]),
    ),
  ]),
) as Partial<Record<PackSkuId, PerCountrySeed>>;

/**
 * EU member states (27). When the visitor's country is one of these and
 * doesn't have an explicit seed entry, fall through to `SEED_PRICING.EU`.
 * Source: https://european-union.europa.eu/principles-countries-history/eu-countries_en
 */
export const EU_MEMBER_STATES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

function pickFromBucket(
  bucket: PerCountrySeed | undefined,
  countryCode: string | null | undefined,
): VisionPackPrice {
  if (!bucket) {
    // Defensive: an unknown SKU in the seed should never happen because
    // the type system pairs `PACK_SKUS` and `SEED_PRICING`, but we still
    // need a sane fallback so a typo doesn't break the home page.
    return { amount: 0, currency: "USD" };
  }
  if (!countryCode) return bucket.DEFAULT;
  const code = countryCode.toUpperCase();
  if (bucket[code]) return bucket[code];
  if (EU_MEMBER_STATES.has(code) && bucket.EU) return bucket.EU;
  return bucket.DEFAULT;
}

/**
 * Resolve the price for a given country code purely from the seed
 * matrix. Used as a fallback when the DB override layer doesn't have a
 * matching row. Pass `null`/`undefined` to get the global default for
 * the requested SKU. Defaults to the Design Pack (lowest tier) when no
 * SKU is supplied — that's the price quoted on the home page hero.
 */
export function seedPricingFor(
  countryCode: string | null | undefined,
  sku: PackSkuId = DEFAULT_PACK_SKU,
): VisionPackPrice {
  // The free tier deliberately has no seed entry; an unknown SKU falls
  // through to the Design Pack (the lowest non-free tier) so callers
  // that accidentally pass a free SKU don't blow up the home page.
  const bucket = SEED_PRICING[sku] ?? SEED_PRICING[DEFAULT_PACK_SKU];
  return pickFromBucket(bucket, countryCode);
}

/**
 * Format a `{ amount, currency }` pair as a localized string. Uses
 * `Intl.NumberFormat` so each currency picks up its conventional symbol
 * placement and thousands separators.
 *
 * Two display modes drive `fractionDigits`:
 *  - 2-decimal currencies (USD, EGP, …) show `.99` only when the price
 *    is non-round in major units (kept as a worked example below);
 *    round prices like `$19` and `EGP 499` print without trailing
 *    `.00` to keep retail copy clean.
 *  - Zero-decimal currencies (JPY, KRW, …) always print without
 *    fractions — `Intl` would honor that automatically but we pin the
 *    digits explicitly so the output stays stable across runtimes.
 *
 * Falls back to `"<currency> <amount>"` if Intl rejects the pair (rare,
 * but defensive — e.g. an invalid currency code from a hand-edited DB row).
 */
export function formatPriceLabel(
  price: VisionPackPrice,
  locale: string = "en",
): string {
  const code = price.currency.toUpperCase();
  const major = minorToMajor(price.amount, code);
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(code);
  const isWholeNumber = Math.abs(major - Math.round(major)) < 0.005;
  const fractionDigits = isZeroDecimal || isWholeNumber ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(major);
  } catch {
    return `${code} ${major}`;
  }
}

/**
 * Normalize a country code from the geo cookie/header into our
 * canonical 2-letter uppercase form, or null if invalid. Defensive
 * against the `cf-ipcountry` "XX" / "T1" sentinel values.
 */
export function normalizeCountryCode(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length !== 2) return null;
  // Cloudflare uses "XX" for unknown and "T1" for Tor traffic. Treat
  // both as "no signal" so we fall back to the seed default.
  if (trimmed === "XX" || trimmed === "T1") return null;
  if (!/^[A-Z]{2}$/.test(trimmed)) return null;
  return trimmed;
}

/** Iterate every (sku, country) seed pair — used by the admin panel's
 * "seed reference" view to list prices that aren't yet overridden. */
export function listSeedPrices(): Array<{
  sku: PackSkuId;
  country_code: string;
  amount: number;
  currency: string;
}> {
  const out: Array<{
    sku: PackSkuId;
    country_code: string;
    amount: number;
    currency: string;
  }> = [];
  for (const sku of Object.keys(SEED_PRICING) as PackSkuId[]) {
    const bucket = SEED_PRICING[sku];
    if (!bucket) continue;
    for (const [country_code, p] of Object.entries(bucket)) {
      out.push({ sku, country_code, amount: p.amount, currency: p.currency });
    }
  }
  return out;
}

export { PACK_SKUS } from "./vision-pack";
export type { PackSkuId } from "./vision-pack";
