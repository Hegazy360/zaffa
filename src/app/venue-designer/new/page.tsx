"use client";

import { VenueDesigner } from "@/components/venue-designer/VenueDesigner";

/**
 * New-design route — open to anonymous traffic as of the email-gate
 * flow. The free render entitlement (`wedding_free_taste_v1`) is granted
 * server-side on first `ai.renderScene` call via `ensureFreePack`, so we
 * no longer block the page on having an active pack. Anonymous visitors
 * mint a Supabase anonymous user in the middleware on first hit; their
 * design is persisted under that user id, and once they upgrade via the
 * email gate the same id keeps owning the design.
 */
export default function VenueDesignerNewPage() {
  return <VenueDesigner />;
}
