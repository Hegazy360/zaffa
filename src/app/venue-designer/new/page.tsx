"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { VenueDesigner } from "@/components/venue-designer/VenueDesigner";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { useDesignerStep } from "@/components/venue-designer/dashboard/DesignerStepper";
import {
  STUDIO_PALETTES,
  STUDIO_VIBES,
} from "@/data/sample-studio";

/**
 * New-design route, open to anonymous traffic as of the email-gate
 * flow. The free render entitlement (`wedding_free_taste_v1`) is granted
 * server-side on first `ai.renderScene` call via `ensureFreePack`, so we
 * no longer block the page on having an active pack. Anonymous visitors
 * mint a Supabase anonymous user in the middleware on first hit; their
 * design is persisted under that user id, and once they upgrade via the
 * email gate the same id keeps owning the design.
 */

/**
 * Prefill from the homepage sample studio (`/?vibe=..&palette=..` CTA).
 *
 * Applies the visitor's picks through the same store actions the wizard's
 * own cards use - `setPalette({ name: preset.id, colors })` is exactly the
 * shape `PaletteCard` writes, so the preset renders as selected - then
 * jumps to the vibe step with basics + palette already answered.
 *
 * LOAD-BEARING ORDER: this component is a *child* of the page, rendered
 * as a sibling AFTER `<VenueDesigner/>`, and React runs effects in tree
 * order, so `VenueDesigner`'s reset-on-mount effect has already wiped
 * the store by the time this effect applies the prefill. Moving this
 * component above the designer, or the reset into a layout, silently
 * reorders that and the prefill gets wiped.
 *
 * Deliberately NO one-shot ref: dev StrictMode re-runs every mount
 * effect, and the designer's reset re-runs with it - a ref guard would
 * skip the re-apply and ship a wiped store (that exact bug shipped in
 * the first draft). The apply is idempotent and the params are captured
 * from the pre-strip render, so re-running is safe.
 */
function StudioPrefill() {
  const params = useSearchParams();
  const { goToStep } = useDesignerStep();

  useEffect(() => {
    const vibeId = params.get("vibe");
    const paletteId = params.get("palette");
    const vibe = STUDIO_VIBES.find((v) => v.id === vibeId);
    const preset = STUDIO_PALETTES.find((p) => p.id === paletteId);
    // Malformed or missing params: plain default designer, no partial state.
    if (!vibe || !preset) return;

    const store = useVenueDesignerStore.getState();
    store.setSetting(vibe.setting);
    store.setPalette({ name: preset.id, colors: preset.colors });
    // English on purpose: style notes feed the AI prompt, and this is the
    // same descriptor that generated the sample they just restyled, so
    // their own render agrees with what they saw.
    store.setStyleNotes(vibe.promptNotes);

    // Strip the params so refresh/back-nav can't re-apply over edits. The
    // designer's autosave replaceState keeps only pathname+hash anyway -
    // stripping deterministically beats losing them inconsistently.
    window.history.replaceState(null, "", "/venue-designer/new#step=vibe");
    goToStep("vibe");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount
  }, []);

  return null;
}

export default function VenueDesignerNewPage() {
  return (
    <>
      <VenueDesigner />
      {/* After the designer on purpose, see StudioPrefill's header. */}
      <Suspense fallback={null}>
        <StudioPrefill />
      </Suspense>
    </>
  );
}
