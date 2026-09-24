import { type ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VisionPackPaywallProvider } from "@/components/vision-pack/VisionPackPaywallProvider";
import { DesignerFlagsProvider } from "@/components/venue-designer/designer-flags-provider";
import { readDesignerFlags } from "@/lib/designer-flags";

/**
 * The designer is an application, not a page.
 *
 * It had no metadata at all, which meant every designer route inherited the
 * homepage's marketing title and, worse, was indexable. A crawler landing on
 * `/venue-designer/[id]` indexes a per-user workspace it cannot render; a
 * crawler landing on `/venue-designer/new` burns crawl budget minting
 * anonymous sessions. `noindex` on the layout covers every route beneath it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("designer");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * Mounts the shared Vision Pack paywall once for all designer pages so
 * any descendant (gallery, designer, generate panel, header) can pop the
 * modal via `usePackPaywall()`. Lives at the layout level so the modal
 * survives client-side navigation between designer routes.
 *
 * Also hands the design partner kill switches to the client, which cannot
 * read their env overrides itself (see src/lib/designer-flags.ts).
 */
export default function VenueDesignerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DesignerFlagsProvider flags={readDesignerFlags()}>
      <VisionPackPaywallProvider>{children}</VisionPackPaywallProvider>
    </DesignerFlagsProvider>
  );
}
