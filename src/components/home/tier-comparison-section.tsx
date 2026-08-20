"use client";

import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Building2,
  Check,
  FileDown,
  Globe,
  Loader2,
  Sparkles,
  Users,
  X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTierPricing, type TierPrice } from "@/components/vision-pack/use-pricing";
import Link from "next/link";
import { usePackCheckoutAction } from "@/components/vision-pack/use-pack-checkout-action";
import { PACK_SKUS, type PackSkuId } from "@/lib/vision-pack";
import { Rise } from "@/components/motion/rise";

// Two-up tier comparison shown on the home page between the "How it
// works" walkthrough and the share-the-artefacts section. Reuses the
// same per-country pricing query as the paywall (`useTierPricing` hits
// `trpc.visionPacks.pricing` once and shares the cache), so this block
// adds zero extra round-trips when the paywall opens later.

// The free-tier SKU never surfaces on the marketing page — it's only
// reachable via the email gate after generation — so the CTA label
// table only covers the purchasable tiers. The same key is reused as
// the post-signup "Get the X Pack — $Y" CTA copy.
const TIER_TO_LABEL_KEY: Partial<Record<PackSkuId, string>> = {
  wedding_design_pack_v1: "tierCtaDesign",
  wedding_vision_pack_v1: "tierCtaVision",
};

export function TierComparisonSection() {
  const t = useTranslations("marketing");
  const { ordered } = useTierPricing();

  return (
    <section
      // Prices resolve from a client-side per-country fetch, so this block
      // is non-deterministic in screenshots — masked in the visual net.
      data-visual-mask
      aria-labelledby="tier-comparison-title"
      className="relative isolate overflow-hidden border-y border-brand-line bg-background"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-25"
      />
      <div className="container mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-rose-200/60 bg-white/60 px-3 py-1 text-eyebrow text-rose-700">
            <Sparkles className="h-3 w-3" />
            {t("tiersEyebrow")}
          </p>
          <h2
            id="tier-comparison-title"
            className="mt-5 font-display text-balance text-[clamp(1.875rem,4vw,2.75rem)] font-light leading-[1.1] tracking-tight"
          >
            {t("tiersTitle")}
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground">
            {t("tiersSubtitle")}
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {ordered.map((tier, idx) => (
            <TierCard key={tier.sku} tier={tier} idx={idx} />
          ))}
          {/* The Whole Wedding. Rendered explicitly rather than through
              `ordered`, which is priced SKUs only — this tier has no SKU, no
              Stripe price and no checkout. Keeping it outside the loop is
              what stops it inheriting `usePackCheckoutAction`, so its button
              can never open Checkout. */}
          <WholeWeddingCard idx={ordered.length} />
        </div>
      </div>
    </section>
  );
}

interface TierCardProps {
  tier: { sku: PackSkuId } & TierPrice;
  idx: number;
}

/**
 * One tier card. Owns its own `usePackCheckoutAction` instance so the
 * pending state is scoped per card (clicking the Vision Pack CTA only
 * spins that card, not the Design Pack one), mirroring the inline
 * `PackCheckoutCard` used on `/r/[renderId]`.
 *
 * The CTA routes through the same buy pipeline as the paywall modal:
 *   - Anonymous visitors → `/auth/signup?next=/checkout?sku=<sku>` and
 *     `/checkout` auto-fires `startCheckout` once they're permanent.
 *   - Authenticated visitors → Stripe Checkout URL directly.
 * Previously this Button was a plain `<Link href="/venue-designer?sku=…">`
 * which bounced anonymous visitors into `/venue-designer/new` (the
 * gallery `useEffect` redirect drops the `sku` query along the way),
 * so they never reached the paywall or signup.
 */
function TierCard({ tier, idx }: TierCardProps) {
  const t = useTranslations("marketing");
  const tv = useTranslations("visionPack");
  const meta = PACK_SKUS[tier.sku];
  const ctaKey = TIER_TO_LABEL_KEY[tier.sku] ?? "tierCtaDesign";
  const isVision = tier.sku === "wedding_vision_pack_v1";
  const { buy, isPending, isAnon } = usePackCheckoutAction();

  return (
    <Rise as="div" delay={idx * 0.08}
          className={cn(
        "relative flex flex-col overflow-hidden rounded-3xl border bg-white/90 p-7",
        isVision
          ? "border-rose-300 shadow-glow-lg ring-1 ring-rose-200/60"
          : "border-brand-line",
      )}
        >
      {isVision ? (
        <span className="absolute end-6 top-6 rounded-full bg-brand-gradient px-3 py-1 text-eyebrow font-medium text-white">
          {t("tierBadgeMostPopular")}
        </span>
      ) : null}

      <div>
        <p className="text-eyebrow text-muted-foreground">
          {tv(
            tier.sku === "wedding_design_pack_v1"
              ? "tierDesignName"
              : "tierVisionName",
          )}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {tv(
            tier.sku === "wedding_design_pack_v1"
              ? "tierDesignTagline"
              : "tierVisionTagline",
          )}
        </p>
        <div className="mt-5 flex items-baseline gap-1.5">
          <span className="font-display text-4xl font-light tracking-tight">
            {tier.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {tv("priceSubtitle")}
          </span>
        </div>
      </div>

      <ul className="mt-6 space-y-2.5 text-sm">
        <IncludedRow
          label={t("tierIncludedRenders", {
            count: meta.quotas.renders,
            styles: meta.quotas.styles,
          })}
          icon={<Sparkles className="h-3.5 w-3.5" />}
        />
        <IncludedRow
          label={
            meta.quotas.videos === 1
              ? t("tierIncludedVideos", { count: meta.quotas.videos })
              : t("tierIncludedVideosPlural", {
                  count: meta.quotas.videos,
                })
          }
          icon={<Sparkles className="h-3.5 w-3.5" />}
        />
        <IncludedRow
          label={t("tierIncludedLookbook")}
          icon={<FileDown className="h-3.5 w-3.5" />}
        />
        <IncludedRow
          label={t("tierIncludedMicrosite")}
          icon={<Globe className="h-3.5 w-3.5" />}
        />
        {meta.includesVenueRecs ? (
          <IncludedRow
            label={t("tierIncludedVenueRecs")}
            icon={<Building2 className="h-3.5 w-3.5" />}
          />
        ) : (
          <ExcludedRow label={t("tierExcludedVenueRecs")} />
        )}
        {meta.includesPlannerMatch ? (
          <IncludedRow
            label={t("tierIncludedPlannerMatch")}
            icon={<Users className="h-3.5 w-3.5" />}
          />
        ) : (
          <ExcludedRow label={t("tierExcludedPlannerMatch")} />
        )}
      </ul>

      <div className="mt-7 pt-6 border-t border-brand-line">
        <Button
          type="button"
          size="lg"
          disabled={isPending}
          onClick={() => buy(tier.sku)}
          // The featured tier gets the one blessed money button; the other
          // stays `outline`, which is the visual hierarchy between them.
          variant={isVision ? "cta" : "outline"}
          className={cn(
            "group h-11 w-full gap-2 text-sm",
            !isVision &&
              "border-brand-line bg-background text-brand-strong hover:bg-brand-tint hover:text-brand-strong",
          )}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {tv("checkoutLoading")}
            </>
          ) : (
            <>
              {isAnon
                ? tv("paywallCtaSignupThenPay", { price: tier.label })
                : t(ctaKey, { price: tier.label })}
              <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </>
          )}
        </Button>
      </div>
    </Rise>
  );
}

function IncludedRow({
  label,
  icon,
}: {
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600">
        <Check className="h-3 w-3" />
      </span>
      <span className="flex-1 text-foreground/90">
        <span className="me-1.5 inline-flex items-center text-rose-500">
          {icon}
        </span>
        {label}
      </span>
    </li>
  );
}

function ExcludedRow({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2 text-muted-foreground">
      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground">
        <XIcon className="h-3 w-3" />
      </span>
      <span className="flex-1">{label}</span>
    </li>
  );
}

/**
 * The full-service tier, shown beside the two packs.
 *
 * It deliberately shares the packs' card chrome so it reads as a third
 * option rather than an advert bolted on — but it carries no price and no
 * checkout. The fee is 10-15% of a wedding budget and budgets across our
 * markets differ by roughly 20x, so any single figure printed here would be
 * wrong somewhere; how we actually quote lives in
 * `docs/pricing-full-service.md`. The CTA is a link to /contact, never
 * `usePackCheckoutAction` — a "tell us about your wedding" button that opens
 * Stripe Checkout would be the worst outcome available on this page.
 */
function WholeWeddingCard({ idx }: { idx: number }) {
  const w = useTranslations("marketing.wholeWedding");

  return (
    <Rise
      as="div"
      delay={idx * 0.08}
      className="surface-dark relative flex flex-col overflow-hidden rounded-plate border border-border p-7 shadow-xl shadow-zinc-900/20"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 end-[-20%] h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/25 to-amber-400/10 blur-3xl"
      />

      <div className="relative">
        <p className="text-eyebrow text-muted-foreground">
          {w("eyebrow")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{w("cardTagline")}</p>

        {/* Where the packs print a number, this prints what happens instead.
            Same slot, same rhythm, so the row still scans as a price line. */}
        <div className="mt-5 flex items-baseline gap-1.5">
          <span className="font-display text-3xl font-light tracking-tight">
            {w("priceLabel")}
          </span>
          <span className="text-xs text-muted-foreground">{w("priceHint")}</span>
        </div>
      </div>

      <ul className="relative mt-6 space-y-2.5 text-sm">
        {(["card1", "card2", "card3", "card4"] as const).map((key) => (
          <li key={key} className="flex items-start gap-2.5 text-muted-foreground">
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-rose-400 to-amber-300"
            />
            <span>{w(key)}</span>
          </li>
        ))}
      </ul>

      <div className="relative mt-7 border-t border-border pt-6">
        <Button
          size="lg"
          render={<Link href="/enquire" />}
          className="group h-11 w-full gap-2 bg-white text-sm text-stone-950 hover:bg-stone-100"
        >
          {w("cta")}
          <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
        </Button>
        <p className="mt-3 text-center text-xs text-stone-500">{w("ctaHint")}</p>
      </div>
    </Rise>
  );
}
