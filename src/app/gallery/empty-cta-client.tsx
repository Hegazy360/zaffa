"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useVisionPackPricing } from "@/components/vision-pack/use-pricing";

/**
 * Client island for the empty-state CTA on the public gallery. Lives
 * here as a small island so the rest of the gallery page remains
 * statically cacheable (ISR `revalidate = 300`); only this CTA opts
 * into per-visitor pricing via the tRPC query.
 */
export function GalleryEmptyCta() {
  const t = useTranslations("visionPack");
  const pricing = useVisionPackPricing();
  return (
    <Button
      render={<Link href="/venue-designer" />}
      className="h-10 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-4 text-white hover:opacity-90"
    >
      {t("buyCtaShort", { price: pricing.label })}
    </Button>
  );
}
