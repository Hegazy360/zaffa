import { type ReactNode } from "react";
import { VisionPackPaywallProvider } from "@/components/vision-pack/VisionPackPaywallProvider";

/**
 * Mounts the shared Vision Pack paywall once for all designer pages so
 * any descendant (gallery, designer, generate panel, header) can pop the
 * modal via `usePackPaywall()`. Lives at the layout level so the modal
 * survives client-side navigation between designer routes.
 */
export default function VenueDesignerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <VisionPackPaywallProvider>{children}</VisionPackPaywallProvider>;
}
