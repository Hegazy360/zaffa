"use client";

import { useTranslations } from "next-intl";
import { Sparkles, Image as ImageIcon, Video, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { usePackPaywall } from "./VisionPackPaywallProvider";
import { useVisionPackPricing } from "./use-pricing";

/**
 * Compact pill shown in the designer header that surfaces the remaining
 * quota + window. The verbose form ("0/20 renders · 0/2 videos · 60 days
 * left") is too wide to sit inline with the Save / Approve buttons on
 * laptop widths, so we render an icon-driven shorthand here and stash
 * the full text in a `title` for the hover affordance.
 *
 * Tapping the pill pops the paywall when the pack is exhausted or the
 * window has expired, so the user can buy a fresh one.
 *
 * Returns null when there's no pack at all — the paywall modal handles
 * the first-time-buy framing on render attempts.
 */
export function VisionPackQuotaBadge() {
  const t = useTranslations("visionPack");
  const { data: pack, isLoading } = trpc.visionPacks.current.useQuery();
  const paywall = usePackPaywall();

  if (isLoading || !pack) return null;

  const exhausted = pack.renders_left === 0 && pack.videos_left === 0;
  const expired = pack.expired;
  const dim = exhausted || expired;

  const handleClick = () => {
    if (expired) {
      paywall.open({ reason: "PACK_WINDOW_EXPIRED" });
    } else if (exhausted) {
      paywall.open({ reason: "PACK_QUOTA_RENDERS" });
    }
  };

  const longForm = t("quotaRemaining", {
    used: pack.renders_used,
    quota: pack.renders_quota,
    videoUsed: pack.videos_used,
    videoQuota: pack.videos_quota,
    days: pack.days_left,
  });

  return (
    <button
      type="button"
      onClick={dim ? handleClick : undefined}
      title={longForm}
      aria-label={longForm}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium tracking-wide transition-all md:gap-2 md:px-2.5 md:text-[11px] ${
        dim
          ? "border-amber-200/80 bg-amber-50/70 text-amber-800 hover:bg-amber-100/70 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 cursor-pointer"
          : "border-rose-200/70 bg-rose-50/60 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200 cursor-default"
      }`}
    >
      <Sparkles className="size-3" aria-hidden />
      <span className="inline-flex items-center gap-0.5 font-mono tabular-nums">
        <ImageIcon className="size-3 opacity-70" aria-hidden />
        {pack.renders_left}
      </span>
      <span aria-hidden className="opacity-40">·</span>
      <span className="inline-flex items-center gap-0.5 font-mono tabular-nums">
        <Video className="size-3 opacity-70" aria-hidden />
        {pack.videos_left}
      </span>
      <span aria-hidden className="opacity-40">·</span>
      <span className="inline-flex items-center gap-0.5 font-mono tabular-nums">
        <Calendar className="size-3 opacity-70" aria-hidden />
        {expired ? "0d" : `${pack.days_left}d`}
      </span>
    </button>
  );
}

/**
 * "Get your Vision Pack" CTA used by marketing surfaces (home, gallery,
 * /venue-designer when the user has no pack). Pops the paywall on click.
 */
export function VisionPackBuyCta({
  size = "lg",
  variant = "primary",
  fullWidth = false,
  returnPath,
}: {
  size?: "sm" | "default" | "lg";
  variant?: "primary" | "outline";
  fullWidth?: boolean;
  returnPath?: string;
}) {
  const t = useTranslations("visionPack");
  const paywall = usePackPaywall();
  const pricing = useVisionPackPricing();
  const className =
    variant === "primary"
      ? "gap-2 bg-brand-gradient text-white shadow-glow hover:opacity-90"
      : "gap-2";
  return (
    <Button
      type="button"
      size={size}
      variant={variant === "primary" ? "default" : "outline"}
      onClick={() => paywall.open({ returnPath })}
      className={`${className} ${fullWidth ? "w-full" : ""}`}
    >
      <Sparkles className="size-4" />
      {t("buyCtaShort", { price: pricing.label })}
    </Button>
  );
}
