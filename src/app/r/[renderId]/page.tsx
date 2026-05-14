"use client";

import { use, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  Loader2,
  ArrowRight,
  ImageOff,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { VisionPackPaywallProvider } from "@/components/vision-pack/VisionPackPaywallProvider";
import { PackCheckoutCard } from "@/components/vision-pack/PackCheckoutCard";
import { useVisionPackPricing } from "@/components/vision-pack/use-pricing";
import { DEFAULT_PACK_SKU, PURCHASABLE_PACK_SKUS } from "@/lib/vision-pack";
import { minorToMajor } from "@/lib/vision-pack-pricing";
import { ttTrack, TIKTOK_EVENTS } from "@/lib/tiktok";

interface PageProps {
  params: Promise<{ renderId: string }>;
}

/**
 * Magic-link reveal page. The visitor lands here after clicking the
 * confirmation link in the email-gate email — by the time this
 * component mounts, the Supabase `verifyOtp` call has flipped them
 * from anonymous to permanent, so `getRenderById` (a protectedProcedure)
 * sees the same user id that owns the render.
 *
 * Two halves:
 *   - The render itself (watermarked for free-tier users, clean for
 *     paid).
 *   - An inline `PackCheckoutPanel` upsell — the same tier picker /
 *     includes list / Stripe CTA that powers the modal paywall, but
 *     rendered flush on the page so the visitor doesn't have to
 *     bounce through a second selector to commit. The
 *     `VisionPackPaywallProvider` is still mounted because
 *     `VisionPackUpgradeCta` (rendered inside the panel) reaches for
 *     paywall context; the modal itself just won't open in this flow.
 */
export default function RenderRevealPage({ params }: PageProps) {
  const { renderId } = use(params);
  return (
    <VisionPackPaywallProvider>
      <RevealInner renderId={renderId} />
    </VisionPackPaywallProvider>
  );
}

function RevealInner({ renderId }: { renderId: string }) {
  const t = useTranslations("renderReveal");
  const tEmail = useTranslations("emailGate");
  const router = useRouter();

  const { data: render, isLoading } =
    trpc.venueDesigns.getRenderById.useQuery({ id: renderId });

  // TikTok purchase funnel — the reveal page is the canonical
  // "product detail" surface for paid Vision Packs. It shows the
  // user's render alongside the tier comparison cards (which trigger
  // `AddToCart`/`InitiateCheckout` further down the funnel), so
  // firing `ViewContent` here keeps the funnel intact for visitors
  // who land via magic-link / shared URL and never see the home
  // hero. Pricing matches the hero so TikTok sees a consistent
  // content_id → value mapping across the funnel.
  const pricing = useVisionPackPricing();
  const ttFiredRef = useRef(false);
  useEffect(() => {
    if (ttFiredRef.current) return;
    if (!render) return;
    if (pricing.isLoading) return;
    ttFiredRef.current = true;
    const major = minorToMajor(pricing.amount, pricing.currency);
    ttTrack(
      TIKTOK_EVENTS.VIEW_CONTENT,
      {
        contents: [
          {
            content_id: DEFAULT_PACK_SKU,
            content_type: "product",
            content_name: "Wedding Design Pack",
            quantity: 1,
            price: major,
          },
        ],
        value: major,
        currency: pricing.currency.toUpperCase(),
      },
      renderId,
    );
  }, [render, pricing.isLoading, pricing.amount, pricing.currency, renderId]);

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="grid min-h-[60vh] place-items-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-rose-500" />
            <p className="mt-3 text-sm text-muted-foreground">
              {t("loadingTitle")}
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!render) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-xl px-6 py-20 text-center">
          <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-muted">
            <ImageOff className="size-6 text-muted-foreground" />
          </div>
          <h1 className="font-display text-3xl font-light tracking-tight">
            {t("notFoundTitle")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("notFoundBody")}</p>
          <Button
            size="lg"
            className="mt-6 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg"
            render={<Link href="/venue-designer" />}
          >
            <Sparkles className="size-4" />
            {t("newDesignCta")}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="relative isolate min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background dark:from-rose-950/15">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grain-bg opacity-50"
        />
        <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium tracking-[0.18em] text-rose-700 uppercase backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
              <Sparkles className="size-3" />
              {t("eyebrow")}
            </div>
            <h1 className="font-display text-balance text-4xl leading-tight font-light tracking-tight sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mx-auto max-w-xl text-pretty text-sm text-muted-foreground sm:text-base">
              {t("body")}
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-2xl border border-rose-200/70 bg-card shadow-xl">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={render.url}
                alt={render.design.name}
                className="block h-auto w-full"
              />
              {render.watermarked ? (
                <div className="pointer-events-none absolute bottom-3 end-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-[10px] font-medium tracking-wide text-white backdrop-blur">
                  {tEmail("watermarkBadge")}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-medium tracking-tight">
                  {render.design.name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {render.design.event_type} · {render.design.setting} ·{" "}
                  {render.design.guest_count
                    ? `${render.design.guest_count} guests`
                    : render.design.size}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  router.push(`/venue-designer/${render.design.id}`)
                }
                className="gap-2"
              >
                {t("saveDesignCta")}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Button>
            </div>
          </div>

          {/* Side-by-side checkout cards — full price + includes +
              its own CTA per tier. Each CTA fires `startCheckout`
              (permanent users) or routes through `/auth/signup`
              (anonymous), preserving `/r/{renderId}` as the
              `returnPath` so they land back here after Stripe. The
              higher-value tier is featured so the visitor sees a
              clear default without locking them out of the entry
              tier — one click commits, no modal in between. The
              second card (Vision Pack) is featured by sort order. */}
          <div className="mt-12 space-y-6">
            <div className="text-center">
              <div className="text-[10px] font-semibold tracking-[0.2em] text-rose-700 uppercase dark:text-rose-300">
                {t("comparePlansEyebrow")}
              </div>
              <h2 className="font-display mt-2 text-3xl font-light tracking-tight sm:text-4xl">
                {t("comparePlansTitle")}
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                {t("comparePlansBody")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
              {PURCHASABLE_PACK_SKUS.map((sku, index) => (
                <PackCheckoutCard
                  key={sku}
                  sku={sku}
                  returnPath={`/r/${renderId}`}
                  featured={index === PURCHASABLE_PACK_SKUS.length - 1}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
