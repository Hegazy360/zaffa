// Server-side Vision Pack pricing resolver.
//
// Combines (1) the geo signal from the request cookie, (2) the DB
// override layer (`vision_pack_pricing`), and (3) the in-code seed
// matrix. Used by:
//   - the public `visionPacks.pricing` tRPC query
//   - server components that need an SSR price (page metadata, public
//     marketing surfaces)
//   - `visionPacks.startCheckout` to bill the user in their market
//     currency

import { prisma } from "@/lib/prisma";
import {
  EU_MEMBER_STATES,
  SEED_PRICING,
  VISION_PACK_COUNTRY_COOKIE,
  type VisionPackPrice,
  normalizeCountryCode,
  seedPricingFor,
} from "@/lib/vision-pack-pricing";

export interface ResolvedVisionPackPricing extends VisionPackPrice {
  /** ISO-2 country code we believe the visitor is in, or null if unknown. */
  country: string | null;
  /** Where the price came from — useful for logs + the admin dashboard. */
  source: "country_override" | "default_override" | "country_seed" | "eu_seed" | "default_seed";
}

/**
 * Read the geo signal from the request. Cookies first (set by the
 * middleware on first hit), then the upstream geo header for the cold
 * case where the cookie hasn't been written yet (first hit, same
 * request). Returns null if nothing is parseable.
 */
export function resolveCountryFromRequest(
  req: Request | null,
): string | null {
  if (!req) return null;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieMatch = cookieHeader.match(
    new RegExp(`(?:^|; )${VISION_PACK_COUNTRY_COOKIE}=([^;]+)`),
  );
  const fromCookie = cookieMatch
    ? normalizeCountryCode(decodeURIComponent(cookieMatch[1]))
    : null;
  if (fromCookie) return fromCookie;

  const fromHeader =
    normalizeCountryCode(req.headers.get("x-vercel-ip-country")) ??
    normalizeCountryCode(req.headers.get("cf-ipcountry"));
  return fromHeader;
}

/**
 * Resolve the effective price for a given country code. Looks up the
 * DB override layer first, falls back to the seed matrix.
 *
 * Caller convention: pass `null` if the country signal is unknown —
 * we'll return the global default from whichever layer wins. Don't
 * normalise here; that's the caller's job.
 */
export async function resolveVisionPackPricing(
  country: string | null,
): Promise<ResolvedVisionPackPricing> {
  // Read both the country-specific override (if any) and the DEFAULT
  // override in one round-trip. We're hitting the same table — Prisma
  // dedupes the connection.
  const codes = country ? [country, "DEFAULT"] : ["DEFAULT"];
  const overrides = await prisma.visionPackPricing.findMany({
    where: { country_code: { in: codes } },
  });
  const byCode = new Map(overrides.map((row) => [row.country_code, row]));

  if (country && byCode.has(country)) {
    const row = byCode.get(country)!;
    return {
      country,
      amount: row.amount,
      currency: row.currency,
      source: "country_override",
    };
  }
  if (byCode.has("DEFAULT")) {
    const row = byCode.get("DEFAULT")!;
    return {
      country,
      amount: row.amount,
      currency: row.currency,
      source: "default_override",
    };
  }

  // Seed fallback. Mirrors `seedPricingFor` but tags the source for the
  // admin debug surface.
  if (country && SEED_PRICING[country]) {
    return { country, ...SEED_PRICING[country], source: "country_seed" };
  }
  if (country && EU_MEMBER_STATES.has(country)) {
    return { country, ...SEED_PRICING.EU, source: "eu_seed" };
  }
  return {
    country,
    ...seedPricingFor(country),
    source: "default_seed",
  };
}
