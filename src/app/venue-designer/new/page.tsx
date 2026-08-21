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
 * shape `PaletteCard` writes, so the preset renders as selected - and then
 * leaves them on the FIRST step.
 *
 * That last part looks like a missed optimisation and is not. The first
 * draft jumped to `vibe`, reasoning that the studio had already answered
 * step 1 (setting) and step 2 (palette). But `basics` is three questions,
 * not one: event type, setting, AND guest count. The studio only supplies
 * the setting, so skipping the step skipped the headcount, and an unset
 * `guestCount` makes the scene generator fall back to the coarse `size`
 * bucket - "a medium layout (about 100 guests)". Every visitor arriving
 * from the homepage silently got a room built for 100 people, on the one
 * render meant to sell the product, in a market where 300+ is ordinary.
 *
 * Landing on `basics` still shows the carry-over (their setting is
 * already selected, and the palette is on the next step), and it asks the
 * one question the studio could not answer.
 *
 * ORDER: rendered as a sibling after `<VenueDesigner/>`, so the designer's
 * reset-on-mount effect has run before this one applies the prefill.
 *
 * An earlier version of this comment claimed that ordering was the thing
 * holding the whole prefill up. A mutation test disproved it: swapping the
 * two still passes, most likely because `useSearchParams` puts this
 * component behind a Suspense boundary and defers its mount past the
 * designer's regardless. The order is kept because it is the one that is
 * verified to work, not because the mechanism is understood, and
 * `studio-handoff.spec.ts` asserts the end state rather than the ordering
 * so it keeps holding if React's scheduling changes underneath it.
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
    window.history.replaceState(null, "", "/venue-designer/new#step=basics");
    goToStep("basics");
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
