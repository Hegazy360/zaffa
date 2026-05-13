"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useIsAnonymous } from "@/lib/use-is-anonymous";
import { type PackSkuId } from "@/lib/vision-pack";

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
   * Whether we're treating the caller as anonymous for routing. Useful
   * for adapting CTA labels ("Sign up to continue" vs "Buy now").
   * `useIsAnonymous` returns `null` while resolving JWT claims; we
   * treat that as anonymous to avoid firing `startCheckout` before the
   * claims fetch resolves and getting an `ANONYMOUS_NOT_ALLOWED`
   * rejection.
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
  const isAnon = anonClaim !== false;

  const routeToSignup = (sku: PackSkuId) => {
    const params = new URLSearchParams({ sku });
    if (returnPath) params.set("returnPath", returnPath);
    const nextPath = `/checkout?${params.toString()}`;
    router.push(`/auth/signup?next=${encodeURIComponent(nextPath)}`);
  };

  const checkout = trpc.visionPacks.startCheckout.useMutation({
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (err, variables) => {
      // Server-side safety net for the claims race: if the hook said
      // `false` but the cookie still carried an anon JWT (or the
      // session flipped between renders), bounce to signup with the
      // selected sku instead of toasting a raw error code. Both the
      // mutation input and its `sku` field are optional in the tRPC
      // schema, so we only re-route if we actually know which tier
      // they were trying to buy.
      if (err.message === "ANONYMOUS_NOT_ALLOWED" && variables?.sku) {
        routeToSignup(variables.sku);
        return;
      }
      toast.error(err.message || t("checkoutFailed"));
    },
  });

  const buy = (sku: PackSkuId) => {
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
