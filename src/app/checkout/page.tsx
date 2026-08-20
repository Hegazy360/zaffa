"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  PURCHASABLE_PACK_SKUS,
  type PackSkuId,
} from "@/lib/vision-pack";
import { useTierPricing } from "@/components/vision-pack/use-pricing";
import { ttTrack, TIKTOK_EVENTS } from "@/lib/tiktok";
import { minorToMajor } from "@/lib/vision-pack-pricing";

/**
 * Auto-checkout landing page. Visitors arrive here from the classic
 * signup flow after creating a permanent account from the paywall: the
 * sign-up form pushes them to `/checkout?sku=...` once Supabase returns
 * a session (or finishes the email-confirm round trip). We immediately
 * fire `visionPacks.startCheckout` and replace the location with the
 * Stripe URL, the visitor sees a brief "redirecting…" card and never
 * has to re-click "Buy".
 *
 * Same page also serves direct deep-links from any future surface that
 * wants to send a logged-in user straight to checkout (e.g. a "Resume
 * checkout" reminder email), anyone landing here without auth gets
 * bounced to `/auth/signin?next=/checkout?sku=...`.
 */
export default function CheckoutLandingPage() {
  return (
    <Suspense fallback={<RedirectingCard />}>
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const t = useTranslations("visionPack");
  const router = useRouter();
  const params = useSearchParams();

  const skuParam = params.get("sku") as PackSkuId | null;
  const returnPath = params.get("returnPath") ?? undefined;
  const sku =
    skuParam && (PURCHASABLE_PACK_SKUS as readonly string[]).includes(skuParam)
      ? skuParam
      : null;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Same source the rest of the app uses; deduped by react-query
  // staleTime so this is free if the surface that linked here already
  // rendered priced tiers.
  const tiers = useTierPricing();

  const checkout = trpc.visionPacks.startCheckout.useMutation({
    onSuccess: ({ url, packId }) => {
      if (url) {
        // Funnel signal: fire BEFORE the redirect so the pixel can
        // flush. `packId` becomes the TikTok event_id so a future
        // server-side CompletePayment from the Stripe webhook can
        // dedupe against the same conversion.
        if (sku) {
          const tier = tiers.bySku[sku];
          if (tier) {
            const major = minorToMajor(tier.amount, tier.currency);
            ttTrack(
              TIKTOK_EVENTS.INITIATE_CHECKOUT,
              {
                contents: [
                  {
                    content_id: sku,
                    content_type: "product",
                    quantity: 1,
                    price: major,
                  },
                ],
                value: major,
                currency: tier.currency.toUpperCase(),
              },
              packId,
            );
          }
        }
        window.location.replace(url);
        return;
      }
      setErrorMessage(t("checkoutFailed"));
    },
    onError: (err) => {
      // Permanent-account required (anon or no session at all) → bounce
      // to signin, preserving the checkout intent in `?next=`.
      const needsAuth =
        err.message === "ANONYMOUS_NOT_ALLOWED" ||
        err.data?.code === "UNAUTHORIZED";
      if (needsAuth) {
        const params = new URLSearchParams();
        if (sku) params.set("sku", sku);
        if (returnPath) params.set("returnPath", returnPath);
        const next = `/checkout?${params.toString()}`;
        router.replace(`/auth/signin?next=${encodeURIComponent(next)}`);
        return;
      }
      if (err.message === "PACK_ALREADY_ACTIVE") {
        router.replace(returnPath ?? "/dashboard/client");
        return;
      }
      setErrorMessage(err.message || t("checkoutFailed"));
    },
  });

  useEffect(() => {
    if (!sku) {
      setErrorMessage(t("checkoutFailed"));
      return;
    }
    checkout.mutate({ sku, ...(returnPath ? { returnPath } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku, returnPath]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-rose-200/70 bg-card p-8 shadow-xl text-center">
        {errorMessage ? (
          <>
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-100 ring-1 ring-amber-300/60">
              <AlertCircle className="size-6 text-amber-700" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-light tracking-tight">
              {t("checkoutFailed")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-5"
              onClick={() => router.push(returnPath ?? "/venue-designer")}
            >
              {t("paywallNotNow")}
            </Button>
          </>
        ) : (
          <RedirectingCardBody />
        )}
      </div>
    </div>
  );
}

function RedirectingCard() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-rose-200/70 bg-card p-8 shadow-xl text-center">
        <RedirectingCardBody />
      </div>
    </div>
  );
}

function RedirectingCardBody() {
  const t = useTranslations("visionPack");
  return (
    <>
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
        <Sparkles className="size-6 text-rose-600" />
      </div>
      <h1 className="mt-4 font-display text-2xl font-light tracking-tight">
        {t("checkoutLoading")}
      </h1>
      <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("checkoutRedirectingBody")}
      </div>
    </>
  );
}
