"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Check,
  FileDown,
  Globe,
  Sparkles,
  Users,
  X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTierPricing } from "@/components/vision-pack/use-pricing";
import { PACK_SKUS, type PackSkuId } from "@/lib/vision-pack";

// Two-up tier comparison shown on the home page between the "How it
// works" walkthrough and the share-the-artefacts section. Reuses the
// same per-country pricing query as the paywall (`useTierPricing` hits
// `trpc.visionPacks.pricing` once and shares the cache), so this block
// adds zero extra round-trips when the paywall opens later.

// The free-tier SKU never surfaces on the marketing page — it's only
// reachable via the email gate after generation — so the CTA label
// table only covers the purchasable tiers.
const TIER_TO_LABEL_KEY: Partial<Record<PackSkuId, string>> = {
  wedding_design_pack_v1: "tierCtaDesign",
  wedding_vision_pack_v1: "tierCtaVision",
};

export function TierComparisonSection() {
  const t = useTranslations("marketing");
  const tv = useTranslations("visionPack");
  const reduce = useReducedMotion();
  const { ordered } = useTierPricing();

  return (
    <section
      aria-labelledby="tier-comparison-title"
      className="relative isolate overflow-hidden border-y border-rose-100/70 bg-background"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-25"
      />
      <div className="container mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-rose-200/60 bg-white/60 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
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

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {ordered.map((tier, idx) => {
            const meta = PACK_SKUS[tier.sku];
            const ctaKey = TIER_TO_LABEL_KEY[tier.sku];
            const isVision = tier.sku === "wedding_vision_pack_v1";
            return (
              <motion.div
                key={tier.sku}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-64px" }}
                transition={{
                  duration: reduce ? 0 : 0.6,
                  delay: reduce ? 0 : idx * 0.1,
                }}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-3xl border bg-white/90 p-7 dark:bg-card/80",
                  isVision
                    ? "border-rose-300 shadow-xl shadow-rose-600/10 ring-1 ring-rose-200/60 dark:border-rose-700"
                    : "border-rose-100/70 dark:border-rose-900/30",
                )}
              >
                {isVision ? (
                  <span className="absolute end-6 top-6 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white">
                    {t("tierBadgeMostPopular")}
                  </span>
                ) : null}

                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
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

                <div className="mt-7 pt-6 border-t border-rose-100/70 dark:border-rose-900/30">
                  <Button
                    size="lg"
                    // Switch the lower-tier CTA to the `outline` variant
                    // because the `default` variant ships an
                    // `[a]:hover:bg-primary/80` rule (high specificity
                    // via the attribute selector) that wins over a
                    // utility `hover:bg-rose-50` and turns the button
                    // primary-purple on hover when the render element
                    // is a Link <a>. Outline has a vanilla
                    // `hover:bg-muted` so our rose hover overrides
                    // cleanly.
                    variant={isVision ? "default" : "outline"}
                    render={
                      <Link
                        href={`/venue-designer?sku=${tier.sku}`}
                        prefetch={false}
                      />
                    }
                    className={cn(
                      "group h-11 w-full gap-2 text-sm",
                      isVision
                        ? "border-transparent bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-md shadow-rose-600/15 hover:opacity-90"
                        : "border-rose-200/80 bg-white text-rose-700 hover:bg-rose-50/70 hover:text-rose-700 dark:border-rose-900/40 dark:bg-card dark:text-rose-200 dark:hover:bg-rose-950/20 dark:hover:text-rose-200",
                    )}
                  >
                    {t(ctaKey ?? "tierCtaDesign", { price: tier.label })}
                    <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
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
      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
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
