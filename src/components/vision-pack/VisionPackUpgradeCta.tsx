"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatPriceLabel } from "@/lib/vision-pack-pricing";

interface VisionPackUpgradeCtaProps {
  /** Path to bounce back to after the Stripe Checkout success/cancel. */
  returnPath?: string;
  /** Compact variant for surfaces with tight space (e.g. in-card CTA). */
  variant?: "card" | "inline";
}

/**
 * Surfaces a "Unlock the full Vision Pack for +X" call to action when
 * the caller is on the lower paid tier (Design Pack) and a higher
 * tier is available. Renders nothing when:
 *   - the user has no active paid pack (the regular paywall takes over)
 *   - the user is already on the top tier
 *   - the user is on the free tier (the paywall handles the buy CTA)
 *
 * The delta price comes straight from `visionPacks.upgradeQuote`, which
 * resolves both tier prices in the original purchase country so the
 * math stays in the same currency the user paid in.
 */
export function VisionPackUpgradeCta({
  returnPath,
  variant = "card",
}: VisionPackUpgradeCtaProps) {
  const t = useTranslations("visionPack");
  const locale = useLocale();
  const { data: quote, isLoading } = trpc.visionPacks.upgradeQuote.useQuery();

  const startUpgrade = trpc.visionPacks.startUpgrade.useMutation({
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (err) => {
      toast.error(err.message || t("checkoutFailed"));
    },
  });

  if (isLoading || !quote) return null;
  if (quote.deltaAmount <= 0) return null;

  const deltaLabel = formatPriceLabel(
    { amount: quote.deltaAmount, currency: quote.currency },
    locale,
  );
  const toLabel = formatPriceLabel(
    { amount: quote.toAmount, currency: quote.currency },
    locale,
  );

  if (variant === "inline") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={startUpgrade.isPending}
        onClick={() => startUpgrade.mutate({ returnPath })}
        className="gap-2 border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
      >
        {startUpgrade.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
        {t("upgradeCtaInline", { delta: deltaLabel })}
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60 p-4 shadow-sm">
      <div className="text-[10px] font-semibold tracking-[0.2em] text-rose-700 uppercase">
        {t("upgradeCtaEyebrow")}
      </div>
      <h3 className="font-display mt-1 text-xl font-light tracking-tight">
        {t("upgradeCtaTitle", { target: toLabel })}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
        {t("upgradeCtaBody")}
      </p>
      <Button
        type="button"
        size="lg"
        disabled={startUpgrade.isPending}
        onClick={() => startUpgrade.mutate({ returnPath })}
        className="mt-3 w-full gap-2 bg-brand-gradient text-white shadow-glow hover:opacity-90"
      >
        {startUpgrade.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("submitting")}
          </>
        ) : (
          <>
            <ArrowUpRight className="size-4 rtl:-scale-x-100" />
            {t("upgradeCtaButton", { delta: deltaLabel })}
          </>
        )}
      </Button>
    </div>
  );
}
