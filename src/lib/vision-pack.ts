// Vision Pack — shared SKU registry, quotas, and lifecycle helpers used
// by both the tRPC routers and the Stripe webhook. Centralised so the
// paywall, the checkout SKU, and the refund tripwire all reference the
// same numbers.
//
// To add a new tier, append an entry to `PACK_SKUS` here, seed prices
// for it in `src/lib/vision-pack-pricing.ts` (`SEED_PRICING[sku]`), and
// update the EN/AR copy under `marketing.tier*` / `visionPack.*` in
// `messages/*.json`. No DB migration is needed — `VisionPack.sku` is a
// free-form text column.

/** Generation window in days from `paid_at` / `redeemed_at`. */
export const VISION_PACK_WINDOW_DAYS = 60;
/** Refund tripwire — full refund window from `paid_at`. */
export const VISION_PACK_REFUND_HOURS = 24;
/** Default platform fee % shown in the pack-vs-marketplace stacking copy. */
export const VISION_PACK_DEFAULT_PLATFORM_FEE_PCT = 8;

export interface PackQuotas {
  /** Number of photoreal renders included. */
  renders: number;
  /** Number of distinct style buckets. */
  styles: number;
  /** Number of short videos included. */
  videos: number;
}

export interface PackSku {
  id: string;
  /** Marketing label (English). Localised display strings live in messages/*.json. */
  name: string;
  quotas: PackQuotas;
  /** True when the pack unlocks the planner-marketplace handoff. */
  includesPlannerMatch: boolean;
  /** True when Zaffa curates venue recommendations for this pack's event. */
  includesVenueRecs: boolean;
  /** Generation window in days from `paid_at` / `redeemed_at`. */
  durationDays: number;
}

/**
 * Two SKUs ship today:
 *   - **Design Pack** (`wedding_design_pack_v1`): the $19.99 starter
 *     tier — design + microsite + PDF, no planner/venue matching.
 *   - **Vision Pack** (`wedding_vision_pack_v1`): the original $99
 *     full pack — bigger quotas, planner marketplace, plus
 *     Zaffa-curated venue recommendations on the couple's event page.
 *
 * Stamped onto every `VisionPack` row at checkout time so individual
 * purchases keep their tier even if the registry changes later.
 */
export const PACK_SKUS = {
  wedding_design_pack_v1: {
    id: "wedding_design_pack_v1",
    name: "Design Pack",
    quotas: { renders: 10, styles: 2, videos: 1 },
    includesPlannerMatch: false,
    includesVenueRecs: false,
    durationDays: VISION_PACK_WINDOW_DAYS,
  },
  wedding_vision_pack_v1: {
    id: "wedding_vision_pack_v1",
    name: "Vision Pack",
    quotas: { renders: 20, styles: 3, videos: 2 },
    includesPlannerMatch: true,
    includesVenueRecs: true,
    durationDays: VISION_PACK_WINDOW_DAYS,
  },
} as const satisfies Record<string, PackSku>;

export type PackSkuId = keyof typeof PACK_SKUS;

/** Default SKU for the home/marketing surface and any legacy code path. */
export const DEFAULT_PACK_SKU: PackSkuId = "wedding_design_pack_v1";

/** SKU id of the higher-tier pack (planner + venue matching). */
export const VISION_PACK_SKU_ID: PackSkuId = "wedding_vision_pack_v1";

/** Order in which tiers should appear on marketing/comparison surfaces. */
export const PACK_SKU_ORDER: readonly PackSkuId[] = [
  "wedding_design_pack_v1",
  "wedding_vision_pack_v1",
];

/**
 * Narrowed lookup. Returns `null` for unknown ids so callers can decide
 * whether to fall back or surface an error.
 */
export function getPackSku(id: string | null | undefined): PackSku | null {
  if (!id) return null;
  return (PACK_SKUS as Record<string, PackSku>)[id] ?? null;
}

/** Throwing variant for code paths where the SKU is required to proceed. */
export function requirePackSku(id: string | null | undefined): PackSku {
  const sku = getPackSku(id);
  if (!sku) {
    throw new Error(`Unknown Vision Pack SKU: ${id ?? "<empty>"}`);
  }
  return sku;
}

/** Convenience: does this row's SKU unlock the planner marketplace handoff? */
export function packIncludesPlannerMatch(skuId: string | null | undefined): boolean {
  return getPackSku(skuId)?.includesPlannerMatch ?? false;
}

/** Convenience: does this row's SKU surface Zaffa-curated venue recs? */
export function packIncludesVenueRecs(skuId: string | null | undefined): boolean {
  return getPackSku(skuId)?.includesVenueRecs ?? false;
}

/**
 * Generate a URL-safe slug for the public microsite. Combined with the
 * `microsite_slug @unique` constraint at the DB level, collision risk is
 * negligible for v1 traffic levels — but we still retry a few times on
 * the (very unlikely) collision before giving up.
 *
 * Pattern: 10 chars from a Crockford-style alphabet (no 0/O, 1/I/L
 * confusion). Long enough that the URL is hard to enumerate.
 */
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateMicrositeSlug(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  return out;
}

/**
 * Generate a human-friendly gift code. Hyphenated for legibility when
 * printed on a card or copied into chat. Uses the same alphabet as the
 * slug generator.
 */
export function generateGiftCode(): string {
  const part = (n: number) => {
    let out = "";
    for (let i = 0; i < n; i++) {
      out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
    }
    return out.toUpperCase();
  };
  return `${part(4)}-${part(4)}-${part(4)}`;
}

/** Refund tripwire: pack is still refundable iff none of these are set. */
export interface RefundEligibilityInputs {
  paid_at: Date | null;
  microsite_published_at: Date | null;
  lookbook_downloaded_at: Date | null;
  status: string;
}

export function isPackRefundable(p: RefundEligibilityInputs): boolean {
  if (p.status !== "active" && p.status !== "fulfilled") return false;
  if (!p.paid_at) return false;
  if (p.microsite_published_at) return false;
  if (p.lookbook_downloaded_at) return false;
  const elapsedMs = Date.now() - p.paid_at.getTime();
  const cutoffMs = VISION_PACK_REFUND_HOURS * 60 * 60 * 1000;
  return elapsedMs < cutoffMs;
}

/** Helper: window-elapsed flag for displaying the "expired" UI state. */
export function isPackWindowExpired(expires_at: Date | null): boolean {
  if (!expires_at) return false;
  return expires_at.getTime() < Date.now();
}

/**
 * Stripe metadata key. The webhook keys on `metadata.kind` to route the
 * `checkout.session.completed` event to either the installment handler
 * or the vision-pack handler.
 */
export const VISION_PACK_CHECKOUT_KIND = "vision_pack";
