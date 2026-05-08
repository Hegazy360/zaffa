"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { VenueDesigner } from "@/components/venue-designer/VenueDesigner";

/**
 * New-design route is gated behind owning a Vision Pack. Direct entry
 * points (dashboard CTA, footer link) bypass the gallery's pack-aware
 * UI, so we re-check here and bounce no-pack visitors back to the
 * gallery — that page surfaces the buy CTA + paywall hero.
 */
export default function VenueDesignerNewPage() {
  const router = useRouter();
  const { data: pack, isLoading } = trpc.visionPacks.current.useQuery();

  useEffect(() => {
    if (!isLoading && !pack) {
      router.replace("/venue-designer");
    }
  }, [isLoading, pack, router]);

  if (isLoading || !pack) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-rose-500" aria-hidden />
      </div>
    );
  }

  return <VenueDesigner />;
}
