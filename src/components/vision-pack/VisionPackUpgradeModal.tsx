"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatPriceLabel } from "@/lib/vision-pack-pricing";

interface VisionPackUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Path Stripe should bounce back to after the delta charge clears. */
  returnPath?: string;
  /**
   * Optional override for the modal's eyebrow/title/body. Useful when
   * a specific feature triggers the upgrade gate (e.g. "Approve &
   * create event" → "Planner matching is part of the Vision Pack").
   * Defaults to the generic upgrade copy in `visionPack.*`.
   */
  eyebrow?: string;
  title?: string;
  body?: string;
}

/**
 * Dialog wrapper around the delta-priced Vision Pack upgrade CTA.
 * Lives next to `VisionPackUpgradeCta` (the inline/card variant)
 * because both share the same `upgradeQuote` + `startUpgrade` plumbing
 * — the modal just gives feature gates (e.g. "Approve & create event"
 * on Design Pack) a dedicated, focusable surface to convert from
 * instead of a passive sidebar nudge.
 *
 * Renders nothing meaningful when there's no delta to charge (already
 * on the top tier, or no active paid pack) — callers should typically
 * only open this when the user is on a paid lower tier, but we still
 * short-circuit defensively to a "no upgrade available" body.
 */
export function VisionPackUpgradeModal({
  open,
  onOpenChange,
  returnPath,
  eyebrow,
  title,
  body,
}: VisionPackUpgradeModalProps) {
  const t = useTranslations("visionPack");
  const locale = useLocale();
  const { data: quote, isLoading } = trpc.visionPacks.upgradeQuote.useQuery(
    undefined,
    { enabled: open },
  );

  const startUpgrade = trpc.visionPacks.startUpgrade.useMutation({
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (err) => {
      toast.error(err.message || t("checkoutFailed"));
    },
  });

  const hasDelta = !!quote && quote.deltaAmount > 0;
  const deltaLabel =
    hasDelta && quote
      ? formatPriceLabel(
          { amount: quote.deltaAmount, currency: quote.currency },
          locale,
        )
      : "";
  const toLabel =
    hasDelta && quote
      ? formatPriceLabel(
          { amount: quote.toAmount, currency: quote.currency },
          locale,
        )
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="text-[10px] font-semibold tracking-[0.2em] text-rose-700 uppercase">
            {eyebrow ?? t("upgradeCtaEyebrow")}
          </div>
          <DialogTitle className="font-display text-2xl font-light tracking-tight">
            {title ?? (toLabel ? t("upgradeCtaTitle", { target: toLabel }) : "")}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {body ?? t("upgradeCtaBody")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            disabled={!hasDelta || isLoading || startUpgrade.isPending}
            onClick={() => startUpgrade.mutate({ returnPath })}
            className="w-full gap-2 bg-brand-gradient text-white shadow-glow hover:opacity-90"
          >
            {startUpgrade.isPending || isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("submitting")}
              </>
            ) : hasDelta ? (
              <>
                <Sparkles className="size-4" />
                {t("upgradeCtaButton", { delta: deltaLabel })}
                <ArrowUpRight className="size-4 rtl:-scale-x-100" />
              </>
            ) : (
              t("upgradeCtaButton", { delta: "" })
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            {t("paywallNotNow")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
