// Vision Pack — per-country pricing.
//
// Resolution order (all server-side, in `resolveVisionPackPricing`):
//   1. `vision_pack_pricing[country_code = <ISO-2 from cookie>]`  (DB override)
//   2. `vision_pack_pricing[country_code = 'DEFAULT']`            (DB override)
//   3. `SEED_PRICING[country]`                                    (this file)
//   4. EU expansion → `SEED_PRICING.EU`
//   5. `SEED_PRICING.DEFAULT`
//
// The DB layer is the admin's runtime control surface; the seed is the
// floor that ships with code so a fresh deploy always has a price for
// every country.

export const VISION_PACK_COUNTRY_COOKIE = "zaffa_country";

export interface VisionPackPrice {
  /** Major-units amount (e.g. 499, 99). Stripe-side conversion lives in `toStripeAmount`. */
  amount: number;
  /** ISO 4217 code (e.g. "EGP", "USD"). */
  currency: string;
}

/**
 * Seed price matrix. The home market (EG) keeps EGP; GCC nations with
 * 2-decimal currencies and stable USD pegs price in their native
 * currency at a ~$130 equivalent. North America/UK/EU price in their
 * native currencies at the premium tier. Everything else lands on the
 * USD default.
 *
 * 3-decimal currencies (KWD/BHD/OMR/JOD/IQD/LYD/TND) are intentionally
 * routed to USD via the default — Stripe's smallest-unit math for those
 * has rounding constraints (must be a multiple of 10 fils/baisa) that
 * we don't want to encode into a public-pricing seed. Admins can still
 * override per country via the dashboard if needed.
 */
export const SEED_PRICING: Record<string, VisionPackPrice> = {
  // Home market.
  EG: { amount: 499, currency: "EGP" },

  // GCC — 2-decimal currencies only (KWD/BHD/OMR fall through to default).
  SA: { amount: 499, currency: "SAR" },
  AE: { amount: 499, currency: "AED" },
  QA: { amount: 499, currency: "QAR" },

  // UK.
  GB: { amount: 79, currency: "GBP" },

  // EU bloc — handled via the EU expansion below, but we also keep an
  // explicit entry so a direct lookup hits without the expansion.
  EU: { amount: 89, currency: "EUR" },

  // North America.
  US: { amount: 99, currency: "USD" },
  CA: { amount: 99, currency: "USD" }, // CA → USD by intent (premium tier set in USD).

  // Global default for anywhere not explicitly listed (and not EU).
  DEFAULT: { amount: 99, currency: "USD" },
};

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

/**
 * Resolve the price for a given country code purely from the seed
 * matrix. Used as a fallback when the DB override layer doesn't have a
 * matching row. Pass `null`/`undefined` to get the global default.
 */
export function seedPricingFor(
  countryCode: string | null | undefined,
): VisionPackPrice {
  if (!countryCode) return SEED_PRICING.DEFAULT;
  const code = countryCode.toUpperCase();
  if (SEED_PRICING[code]) return SEED_PRICING[code];
  if (EU_MEMBER_STATES.has(code)) return SEED_PRICING.EU;
  return SEED_PRICING.DEFAULT;
}

/**
 * Format a `{ amount, currency }` pair as a localized string. Uses
 * `Intl.NumberFormat` so each currency picks up its conventional symbol
 * placement and thousands separators. We pin `maximumFractionDigits: 0`
 * because the SKU is an integer in major units and showing ".00" feels
 * cluttered for retail pricing.
 *
 * Falls back to `"<currency> <amount>"` if Intl rejects the pair (rare,
 * but defensive — e.g. an invalid currency code from a hand-edited DB row).
 */
export function formatPriceLabel(
  price: VisionPackPrice,
  locale: string = "en",
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: price.currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(price.amount);
  } catch {
    return `${price.currency} ${price.amount}`;
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
