"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import {
  PURCHASABLE_PACK_SKUS,
  VISION_PACK_WINDOW_DAYS,
  type PackSkuId,
} from "@/lib/vision-pack";
import { useTierPricing } from "@/components/vision-pack/use-pricing";
import { ttTrack, TIKTOK_EVENTS } from "@/lib/tiktok";
import { minorToMajor } from "@/lib/vision-pack-pricing";

// How long we wait on the webhook before we surface the "still processing"
// fallback UI. Webhooks usually land in <1s; ~30s is a generous ceiling
// even for live mode. After this we stop the polling loop and let the user
// retry manually instead of leaving the spinner running forever.
const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_500;

/**
 * Post-checkout success page. Stripe redirects here with `?pack=<id>`
 * (plus `?upgrade=<id>` on a tier upgrade) and an optional
 * `?return=<path>`. We poll `visionPacks.checkoutStatus` against that
 * *specific* row until the webhook lands, then either auto-bounce to
 * the return path or render the editorial "you're in" panel.
 *
 * We deliberately do NOT use `visionPacks.current` here — most users
 * already have an `active` free `wedding_free_taste_v1` pack from the
 * email-gate flow, so "the user's currently-active pack" returns
 * truthy the moment Stripe redirects back and would race the
 * pending-payment webhook, sending users on before they've actually
 * been credited. Same for upgrades, where the parent pack row is
 * already `active` before the upgrade webhook fires.
 *
 * After POLL_TIMEOUT_MS without a flip we stop polling and surface a
 * manual-refresh / contact-support fallback so the page never hangs
 * forever (webhook listener down, Stripe outage, async payment
 * method, etc.).
 */
export default function VenueDesignerWelcomePage() {
  const t = useTranslations("visionPack");
  // Tier eyebrows ("Design Pack" / "Vision Pack" and Arabic equivalents)
  // live in the marketing namespace so the home page and this success
  // panel speak the same language about each SKU. We resolve them
  // lazily so the page can fall back to a generic "your pack" title
  // during the brief window before `checkoutStatus` returns.
  const tTier = useTranslations("marketing.tier");
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const returnPath = searchParams.get("return") ?? "/venue-designer";
  const packId = searchParams.get("pack") ?? undefined;
  const upgradeId = searchParams.get("upgrade") ?? undefined;
  const [stalled, setStalled] = useState(false);

  // No pack/upgrade id in the URL → we can't poll a specific row. This
  // shouldn't happen via Stripe's success URL but guard so a hand-typed
  // /welcome doesn't hammer the API forever.
  const hasTarget = Boolean(packId || upgradeId);

  const { data: status, refetch } = trpc.visionPacks.checkoutStatus.useQuery(
    { packId, upgradeId },
    {
      enabled: hasTarget,
      refetchInterval: (query) => {
        if (query.state.data?.ready) return false;
        if (stalled) return false;
        return POLL_INTERVAL_MS;
      },
    },
  );

  const ready = status?.ready === true;

  // Resolve the localized tier label off the pack's SKU. `status.sku`
  // is typed as `string`, so we only call into the marketing
  // namespace when it actually matches a known tier key; anything
  // else (or pre-load) falls back to the generic title so we don't
  // crash on a missing-message error if the registry diverges from
  // the i18n file.
  const packLabel: string | null = (() => {
    if (!status?.sku) return null;
    try {
      return tTier(`${status.sku}.eyebrow` as Parameters<typeof tTier>[0]);
    } catch {
      return null;
    }
  })();

  // Cap the polling loop. A timer is the right fit here (vs. a counter on
  // the query) because it survives polling-interval changes and gives us
  // one place to flip the stalled flag.
  useEffect(() => {
    if (ready || stalled || !hasTarget) return;
    const timer = setTimeout(() => setStalled(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready, stalled, hasTarget]);

  useEffect(() => {
    if (ready) {
      const t = setTimeout(() => {
        router.push(returnPath);
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [ready, returnPath, router]);

  // Funnel signal — fire TikTok CompletePayment exactly once per
  // mount, the moment the webhook confirmation lands. We use the
  // packId/upgradeId from the URL as the TikTok event_id so a future
  // server-side fire from the Stripe webhook (Events API) can dedupe
  // against the same conversion.
  //
  // Revenue is resolved from the same pricing query the rest of the
  // app uses; matches what the buyer was charged in normal cases
  // (pricing rarely changes mid-flow). If we can't resolve the
  // tier price for any reason we still fire the event without
  // value/currency so the funnel coverage stays intact — TikTok counts
  // the conversion either way.
  const tiers = useTierPricing();
  const ttFiredRef = useRef(false);
  useEffect(() => {
    if (ttFiredRef.current) return;
    if (!ready || !status) return;
    const conversionId = upgradeId ?? status.packId;
    const sku = status.sku as PackSkuId | undefined;
    const isPurchasable =
      !!sku && (PURCHASABLE_PACK_SKUS as readonly string[]).includes(sku);
    const tier = isPurchasable ? tiers.bySku[sku] : undefined;
    ttFiredRef.current = true;
    if (tier) {
      const major = minorToMajor(tier.amount, tier.currency);
      ttTrack(
        TIKTOK_EVENTS.COMPLETE_PAYMENT,
        {
          contents: [
            {
              content_id: sku!,
              content_type: "product",
              quantity: 1,
              price: major,
            },
          ],
          value: major,
          currency: tier.currency.toUpperCase(),
        },
        conversionId,
      );
    } else {
      ttTrack(
        TIKTOK_EVENTS.COMPLETE_PAYMENT,
        sku
          ? { contents: [{ content_id: sku, content_type: "product" }] }
          : undefined,
        conversionId,
      );
    }
  }, [ready, status, upgradeId, tiers]);

  const onManualRefresh = () => {
    setStalled(false);
    void refetch();
  };

  return (
    <>
      <Navbar />
      <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-gradient-to-b from-rose-50/60 via-background to-background">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grain-bg opacity-50"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl"
        />
        <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center sm:py-32">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8 grid size-20 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60"
          >
            {ready ? (
              <Sparkles className="size-9 text-rose-600" />
            ) : stalled ? (
              <AlertCircle className="size-9 text-amber-600" />
            ) : (
              <Loader2 className="size-9 animate-spin text-rose-600" />
            )}
          </motion.div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-white/80 px-3 py-1 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
            {t("successEyebrow")}
          </div>
          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display mt-4 text-balance text-3xl font-light tracking-tight sm:text-4xl"
          >
            {stalled && !ready
              ? t("stalledTitle")
              : packLabel
                ? t("successTitle", { pack: packLabel })
                : t("successTitleGeneric")}
          </motion.h1>
          <p className="mt-4 max-w-md text-pretty text-sm text-muted-foreground sm:text-base leading-relaxed">
            {ready || !stalled
              ? t("successBody", { days: VISION_PACK_WINDOW_DAYS })
              : t("stalledBody")}
          </p>
          <div className="champagne-hairline mx-auto mt-8 h-px w-32" aria-hidden />
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            {stalled && !ready ? (
              <>
                <Button
                  type="button"
                  size="lg"
                  onClick={onManualRefresh}
                  className="h-11 gap-2 bg-brand-gradient px-5 text-white shadow-glow hover:opacity-90"
                >
                  <Loader2 className="size-4" />
                  {t("stalledRefresh")}
                </Button>
                <Button
                  render={
                    <a href="mailto:support@zaffa.ai?subject=Vision%20Pack%20checkout%20stuck" />
                  }
                  size="lg"
                  variant="ghost"
                >
                  {t("stalledContact")}
                </Button>
              </>
            ) : (
              <Button
                render={<Link href={returnPath} />}
                size="lg"
                disabled={!ready}
                className="h-11 gap-2 bg-brand-gradient px-5 text-white shadow-glow hover:opacity-90 disabled:opacity-60"
              >
                {ready ? (
                  <>
                    {t("successCta")}
                    <ArrowRight className="size-4 rtl:-scale-x-100" />
                  </>
                ) : (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("checkoutLoading")}
                  </>
                )}
              </Button>
            )}
          </div>
          <p className="mt-10 max-w-md text-pretty text-xs text-muted-foreground leading-relaxed">
            {t("refundPolicyShort")}
          </p>
        </div>
      </div>
    </>
  );
}
