"use client";

// TikTok Pixel standard event helpers.
//
// Event names match TikTok's web-pixel spec exactly (case-sensitive) so
// the Ads Manager dashboard recognizes them as *standard* events
// available for campaign optimization. Custom event names work but
// bypass that optimisation entirely, TikTok shows the warning
// "Custom events and page view events cannot be used as optimization
// events" when no standard events have hit the pixel yet, so we
// deliberately only expose the standard set here.
//
// Vertical (purchase) funnel coverage:
//   ViewContent → AddToCart → InitiateCheckout → CompletePayment
// Lead / activation funnel coverage:
//   ViewContent → SubmitForm → CompleteRegistration
//
// Wiring both funnels means every TikTok ad objective (Conversions,
// Lead Generation, Traffic-to-Purchase) finds a real standard event to
// optimize toward, even for visitors who never reach the Stripe path.
//
// `value` is in MAJOR currency units (e.g. 99 USD, not 9900 cents) per
// TikTok's spec, convert minor-units amounts via
// `minorToMajor(amount, currency)` from `vision-pack-pricing.ts` before
// passing them in.
//
// `eventId` should be the same string as any matching server-side
// Events API call so TikTok dedupes the pair. Use a stable id like the
// VisionPack id (browser AddToCart + server CompletePayment from the
// Stripe webhook can share it).

export const TIKTOK_EVENTS = {
  VIEW_CONTENT: "ViewContent",
  ADD_TO_CART: "AddToCart",
  INITIATE_CHECKOUT: "InitiateCheckout",
  COMPLETE_PAYMENT: "CompletePayment",
  // Activation / lead funnel, paired with the purchase funnel so
  // campaigns optimizing for "Lead" or "Sign-up" objectives have a
  // real standard event to land on. `SubmitForm` fires on
  // intermediate captures (e.g. the email gate); `CompleteRegistration`
  // fires once the account is actually created.
  SUBMIT_FORM: "SubmitForm",
  COMPLETE_REGISTRATION: "CompleteRegistration",
} as const;

export type TikTokEvent = (typeof TIKTOK_EVENTS)[keyof typeof TIKTOK_EVENTS];

export interface TikTokContent {
  content_id: string;
  content_type?: "product" | "product_group";
  content_name?: string;
  quantity?: number;
  /** Per-unit price in major currency units. */
  price?: number;
}

export interface TikTokEventProps {
  contents?: TikTokContent[];
  /** Total revenue in major currency units (e.g. 99 not 9900). */
  value?: number;
  /** ISO 4217 code, uppercase (USD, EUR, EGP, …). */
  currency?: string;
  description?: string;
}

declare global {
  interface Window {
    ttq?: {
      track: (
        event: string,
        properties?: TikTokEventProps,
        opts?: { event_id?: string },
      ) => void;
      page: () => void;
      identify: (props: Record<string, unknown>) => void;
    };
  }
}

/**
 * Fire a TikTok Pixel event. No-ops when:
 *  - `NEXT_PUBLIC_TIKTOK_PIXEL_ID` isn't set (CI, tests, local without a key)
 *  - called from SSR / a server component
 *  - `ttq` failed to load (ad-blockers, network errors)
 *
 * Errors are swallowed, analytics must never break a render.
 */
export function ttTrack(
  event: TikTokEvent,
  properties?: TikTokEventProps,
  eventId?: string,
): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID) return;
  try {
    window.ttq?.track(
      event,
      properties,
      eventId ? { event_id: eventId } : undefined,
    );
  } catch {
    // analytics must never throw
  }
}
