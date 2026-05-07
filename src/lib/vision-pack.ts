// Vision Pack — shared constants + helpers used by both the tRPC routers
// and the Stripe webhook. Centralised so the paywall, the checkout SKU,
// and the refund tripwire all reference the same numbers.
//
// To change pack pricing or composition, edit `VISION_PACK_SKU` here and
// update the EN/AR copy under `visionPack.*` in `messages/*.json`. Bump
// the `version` if past purchases need to keep their old quota math.

export const VISION_PACK_PRICE_EGP = 499;
export const VISION_PACK_PRICE_CURRENCY = "EGP";
/** Generation window in days from `paid_at` / `redeemed_at`. */
export const VISION_PACK_WINDOW_DAYS = 60;
/** Refund tripwire — full refund window from `paid_at`. */
export const VISION_PACK_REFUND_HOURS = 24;
export const VISION_PACK_RENDERS_QUOTA = 20;
export const VISION_PACK_VIDEOS_QUOTA = 2;
export const VISION_PACK_STYLES = 3;

/** Default platform fee % shown in the pack-vs-marketplace stacking copy. */
export const VISION_PACK_DEFAULT_PLATFORM_FEE_PCT = 8;

/**
 * SKU descriptor — one source of truth for the Stripe Checkout line item
 * + the on-page "what's included" copy.
 */
export const VISION_PACK_SKU = {
  id: "wedding_vision_pack_v1",
  priceEgp: VISION_PACK_PRICE_EGP,
  currency: VISION_PACK_PRICE_CURRENCY,
  windowDays: VISION_PACK_WINDOW_DAYS,
  rendersQuota: VISION_PACK_RENDERS_QUOTA,
  videosQuota: VISION_PACK_VIDEOS_QUOTA,
  styles: VISION_PACK_STYLES,
} as const;

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
