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
 * Three SKUs ship today:
 *   - **Free Taste** (`wedding_free_taste_v1`): the email-gated free
 *     render. 1 render, watermarked, no videos / planner / venue. Granted
 *     server-side on first `ai.renderScene` call by anonymous (or
 *     not-yet-paid) users via `ensureFreePack`. Never sold through
 *     Stripe; `amount=0`.
 *   - **Design Pack** (`wedding_design_pack_v1`): the $19.99 starter
 *     tier — design + microsite + PDF, no planner/venue matching.
 *   - **Vision Pack** (`wedding_vision_pack_v1`): the $99.99 full
 *     pack — bigger quotas, planner marketplace, plus
 *     Zaffa-curated venue recommendations on the couple's event page.
 *
 * Stamped onto every `VisionPack` row at checkout time so individual
 * purchases keep their tier even if the registry changes later.
 */
export const PACK_SKUS = {
  wedding_free_taste_v1: {
    id: "wedding_free_taste_v1",
    name: "Free Taste",
    quotas: { renders: 1, styles: 1, videos: 0 },
    includesPlannerMatch: false,
    includesVenueRecs: false,
    // Free taste has a tight window: 7 days. Long enough for the magic-link
    // confirmation + sharing the result, short enough that anonymous user
    // GC + abuse cleanup don't accumulate.
    durationDays: 7,
  },
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

/** SKU id of the free email-gated tier. Granted server-side; never sold. */
export const FREE_PACK_SKU_ID: PackSkuId = "wedding_free_taste_v1";

/** Default SKU for the home/marketing surface and any legacy code path. */
export const DEFAULT_PACK_SKU: PackSkuId = "wedding_design_pack_v1";

/** SKU id of the higher-tier pack (planner + venue matching). */
export const VISION_PACK_SKU_ID: PackSkuId = "wedding_vision_pack_v1";

/** Tiers that can be sold through Stripe checkout. Excludes the free SKU. */
export const PURCHASABLE_PACK_SKUS: readonly PackSkuId[] = [
  "wedding_design_pack_v1",
  "wedding_vision_pack_v1",
];

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
 * Convenience: does this row's SKU allow generating videos? Free Taste
 * explicitly does not. Paid tiers have non-zero `videos` quota; we still
 * gate on the SKU directly so a UI ceiling check ("you can upgrade for
 * videos") returns a stable answer independent of `videos_used`.
 */
export function packAllowsVideo(skuId: string | null | undefined): boolean {
  return (getPackSku(skuId)?.quotas.videos ?? 0) > 0;
}

/** True when this pack is the free email-gated tier. */
export function isFreePack(skuId: string | null | undefined): boolean {
  return skuId === FREE_PACK_SKU_ID;
}

/**
 * Localized display name for a pack tier, used by server-side
 * surfaces (Stripe webhook → notification emails, bell copy) that
 * can't go through `next-intl` because they run outside of a
 * request locale context.
 *
 * Kept here next to the SKU registry so adding a new tier only
 * touches one file. Mirrors `marketing.tier.<sku>.eyebrow` in
 * `messages/*.json` — keep them in sync if you change either side.
 */
const PACK_DISPLAY_NAMES: Record<PackSkuId, { en: string; ar: string }> = {
  wedding_free_taste_v1: { en: "Free Taste", ar: "التجربة المجانية" },
  wedding_design_pack_v1: { en: "Design Pack", ar: "حزمة التصميم" },
  wedding_vision_pack_v1: { en: "Vision Pack", ar: "حزمة الرؤية" },
};

export function localizedPackName(
  skuId: string | null | undefined,
  locale: "en" | "ar",
): string {
  if (skuId && skuId in PACK_DISPLAY_NAMES) {
    return PACK_DISPLAY_NAMES[skuId as PackSkuId][locale];
  }
  return locale === "ar" ? "الحزمة" : "Pack";
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
  /**
   * Minor-units paid amount on the pack row. Used to short-circuit
   * refunds for the free tier — there's nothing to refund.
   */
  amount: number;
  /**
   * Most recent payment timestamp across the original purchase and any
   * upgrade. If null/undefined, falls back to `paid_at`. The refund
   * window resets on every successful payment so upgrades extend the
   * window from the upgrade date, not the original purchase.
   */
  latest_paid_at?: Date | null;
}

export function isPackRefundable(p: RefundEligibilityInputs): boolean {
  if (p.status !== "active" && p.status !== "fulfilled") return false;
  // The free email-gated tier is never refundable — `amount === 0` means
  // we never charged anything to refund.
  if (p.amount === 0) return false;
  const effectivePaidAt = p.latest_paid_at ?? p.paid_at;
  if (!effectivePaidAt) return false;
  if (p.microsite_published_at) return false;
  if (p.lookbook_downloaded_at) return false;
  const elapsedMs = Date.now() - effectivePaidAt.getTime();
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
/**
 * Discriminator on Stripe Checkout sessions that upgrade an existing
 * pack from a lower tier to a higher tier (delta-priced). Separate
 * from the regular pack-purchase kind so the webhook handler can
 * apply quota math + record the audit-trail row without confusing
 * the new-pack happy path.
 */
export const VISION_PACK_UPGRADE_CHECKOUT_KIND = "vision_pack_upgrade";
