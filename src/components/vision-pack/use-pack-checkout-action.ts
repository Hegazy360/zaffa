"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useIsAnonymous } from "@/lib/use-is-anonymous";
import { type PackSkuId } from "@/lib/vision-pack";
import { useTierPricing } from "@/components/vision-pack/use-pricing";
import { ttTrack, TIKTOK_EVENTS } from "@/lib/tiktok";
import { minorToMajor } from "@/lib/vision-pack-pricing";

interface Args {
  /** Optional path to bounce back to after Stripe success/cancel. */
  returnPath?: string;
}

interface PackCheckoutAction {
  /**
   * Kick off the buy flow for `sku`. Anonymous visitors are bounced to
   * `/auth/signup?next=/checkout?sku=...` — `/checkout` then auto-fires
   * `startCheckout` once they're permanent. Authenticated visitors hit
   * Stripe directly.
   */
  buy: (sku: PackSkuId) => void;
  /**
   * `true` once a Stripe Checkout session is being created. Callers
   * disable their CTA on this so a double-click doesn't enqueue two
   * sessions back-to-back.
   */
  isPending: boolean;
  /**
   * Whether we *know* the caller is anonymous. Useful for adapting CTA
   * labels ("Sign up to continue" vs "Buy now"). `useIsAnonymous`
   * returns `null` while resolving JWT claims; we treat that loading
   * window as "not yet known" (false) rather than "anonymous" so the
   * label doesn't briefly read "Sign up…" for a permanent user who
   * just hasn't had their claims resolved client-side yet. The
   * server-side `ANONYMOUS_NOT_ALLOWED` fallback in `checkout.onError`
   * still catches the rare case where a truly-anon visitor clicks
   * inside that initial loading window — they pay one extra server
   * round-trip before being routed to signup, which is worth it to
   * avoid the "sign up redirect on first click, payment on second"
   * confusion that hits every permanent user otherwise.
   */
  isAnon: boolean;
}

/**
 * Shared checkout action used by both the modal paywall
 * (`PackCheckoutPanel` with one shared CTA) and the inline
 * comparison cards on `/r/[renderId]` (`PackCheckoutCard`, one CTA
 * per tier). Centralises the anon-vs-permanent routing and the
 * `ANONYMOUS_NOT_ALLOWED` server-side safety net so the two surfaces
 * can't drift.
 */
export function usePackCheckoutAction({
  returnPath,
}: Args = {}): PackCheckoutAction {
  const router = useRouter();
  const t = useTranslations("visionPack");
  const anonClaim = useIsAnonymous();
  // Only treat the caller as anonymous when we've actually resolved
  // their JWT claims and they came back `is_anonymous: true`. The
  // null (loading) state is treated as "unknown — try the buy path,
  // let the server be the source of truth". See `isAnon` jsdoc above
  // for why this beats the previous "null → anon" treatment.
  const isAnon = anonClaim === true;
  // Reads from the same tRPC pricing query as the rest of the app
  // (deduped by react-query's 5-min staleTime), so this hook adds no
  // extra round-trip in surfaces that already render priced tiers.
  // Used to attach value/currency/contents to the TikTok funnel events.
  const tiers = useTierPricing();

  // Resolve a TikTok-shaped contents/value/currency payload for `sku`.
  // Returns null when the tier price isn't in `bySku` yet (extremely
  // rare — `useTierPricing` falls back to seed prices immediately) so
  // callers can skip firing rather than send a malformed event.
  const ttPayloadFor = (sku: PackSkuId) => {
    const tier = tiers.bySku[sku];
    if (!tier) return null;
    const major = minorToMajor(tier.amount, tier.currency);
    return {
      contents: [
        {
          content_id: sku,
          content_type: "product" as const,
          quantity: 1,
          price: major,
        },
      ],
      value: major,
      currency: tier.currency.toUpperCase(),
    };
  };

  const routeToSignup = (sku: PackSkuId) => {
    const params = new URLSearchParams({ sku });
    if (returnPath) params.set("returnPath", returnPath);
    const nextPath = `/checkout?${params.toString()}`;
    router.push(`/auth/signup?next=${encodeURIComponent(nextPath)}`);
  };

  const checkout = trpc.visionPacks.startCheckout.useMutation({
    onSuccess: ({ url, packId }, variables) => {
      // Funnel signal — fire BEFORE the redirect so the pixel has time
      // to flush. `packId` is used as the TikTok event_id so a future
      // server-side CompletePayment from the Stripe webhook can dedupe
      // against the same conversion.
      if (variables?.sku) {
        const payload = ttPayloadFor(variables.sku);
        if (payload) {
          ttTrack(TIKTOK_EVENTS.INITIATE_CHECKOUT, payload, packId);
        }
      }
      if (url) window.location.href = url;
    },
    onError: (err, variables) => {
      // Server-side safety net for the auth race. Two flavours we
      // route to signup instead of toasting:
      //   - `ANONYMOUS_NOT_ALLOWED` — caller has an anon Supabase
      //     session (e.g. they ran a free try) and the client hook
      //     hadn't resolved that yet when they clicked.
      //   - `UNAUTHORIZED` (no message) — caller has no session at
      //     all (fresh visitor, cleared cookies). Mirrors the same
      //     branch in `/checkout/page.tsx`'s onError.
      // Both happen when a visitor clicks a buy CTA inside the
      // ~100ms window before `useIsAnonymous` resolves; the fallback
      // makes that loading state invisible to the user.
      // We only re-route when we actually know which sku they were
      // trying to buy — the input shape is optional in the tRPC
      // schema so this guard is load-bearing.
      const needsAuth =
        err.message === "ANONYMOUS_NOT_ALLOWED" ||
        err.data?.code === "UNAUTHORIZED";
      if (needsAuth && variables?.sku) {
        routeToSignup(variables.sku);
        return;
      }
      toast.error(err.message || t("checkoutFailed"));
    },
  });

  const buy = (sku: PackSkuId) => {
    // Funnel signal — TikTok requires AddToCart for vertical funnel
    // optimization. We don't have a literal cart, so we fire it on the
    // buy-intent click (same moment as routing the user toward
    // signup-or-Stripe).
    const payload = ttPayloadFor(sku);
    if (payload) ttTrack(TIKTOK_EVENTS.ADD_TO_CART, payload);
    if (isAnon) {
      routeToSignup(sku);
      return;
    }
    checkout.mutate({
      sku,
      ...(returnPath ? { returnPath } : {}),
    });
  };

  return { buy, isPending: checkout.isPending, isAnon };
}
