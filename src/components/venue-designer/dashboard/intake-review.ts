// The client half of F3, "Before we render": what the intake check is asked,
// when it is asked again, and which of its answers the card may act on.
//
// Pure, no React, so the rules are unit tested on their own
// (tests/intake-review.test.ts); IntakeReviewCard only wires them up.

import {
  MAX_TOTAL_REFERENCES,
  REFERENCE_CATEGORIES,
  type DesignPalette,
  type EventType,
  type Ref,
  type ReferenceCategory,
  type Setting,
} from "@/types/venue-designer";

/** Quiet time after the last change before the check is asked. */
export const INTAKE_DEBOUNCE_MS = 800;

export type IntakeConflictKind = "setting" | "guest_count" | "notes" | "other";

/** `ai.checkIntake`'s answer, as the card reads it. */
export interface IntakeCheckResult {
  summary: string;
  briefEn: string;
  conflicts: Array<{
    kind: IntakeConflictKind;
    message: string | null;
    suggestedSetting: Setting | null;
  }>;
  venueCandidateIndexes: number[];
  notesSetting: Setting | "unclear";
}

export type IntakeConflict = IntakeCheckResult["conflicts"][number];

export interface IntakeState {
  eventType: EventType;
  setting: Setting;
  guestCount: number | null;
  palette: DesignPalette;
  references: Record<ReferenceCategory, Ref[]>;
  styleNotes: string;
  hasVenuePhoto: boolean;
  locale: string;
}

/** Which reference sat at each index of a request, to map answers back. */
export interface IntakeRefSlot {
  id: string;
  category: ReferenceCategory;
}

export interface IntakeRequest {
  /** Same inputs, same key: the answer is reused instead of asked again. */
  key: string;
  input: {
    eventType: EventType;
    setting: Setting;
    guestCount: number | null;
    palette: DesignPalette;
    styleNotes: string;
    references: Array<{ url: string; category: ReferenceCategory }>;
    hasVenuePhoto: boolean;
  };
  slots: IntakeRefSlot[];
}

/**
 * What to ask the check, or null when there is nothing to read yet (no
 * notes, no references and no venue photo: every render would say the same
 * thing, so it is not worth a call). References go in the order the render
 * sends them, capped the same way, so an index means the same image to the
 * check, the card and the render.
 */
export function buildIntakeRequest(state: IntakeState): IntakeRequest | null {
  const references: IntakeRequest["input"]["references"] = [];
  const slots: IntakeRefSlot[] = [];
  outer: for (const category of REFERENCE_CATEGORIES) {
    for (const ref of state.references[category]) {
      if (references.length >= MAX_TOTAL_REFERENCES) break outer;
      references.push({ url: ref.url, category });
      slots.push({ id: ref.id, category });
    }
  }
  const styleNotes = state.styleNotes.trim();
  if (!styleNotes && references.length === 0 && !state.hasVenuePhoto) return null;

  const input: IntakeRequest["input"] = {
    eventType: state.eventType,
    setting: state.setting,
    guestCount: state.guestCount,
    palette: { name: state.palette.name, colors: state.palette.colors.slice(0, 8) },
    styleNotes,
    references,
    hasVenuePhoto: state.hasVenuePhoto,
  };
  return { key: JSON.stringify([state.locale, input]), input, slots };
}

// --- The in-memory answer cache ------------------------------------------

export interface CachedIntake {
  result: IntakeCheckResult;
  slots: IntakeRefSlot[];
}

// Module scope on purpose: leaving the generate step and coming back
// remounts the card, and the same inputs must not cost a second call.
// Never persisted; a reload asks again.
const answers = new Map<string, CachedIntake>();
const failures = new Set<string>();
const CACHE_LIMIT = 30;

export function recallIntake(key: string): CachedIntake | undefined {
  return answers.get(key);
}

export function rememberIntake(key: string, value: CachedIntake): void {
  answers.delete(key);
  answers.set(key, value);
  if (answers.size > CACHE_LIMIT) {
    const oldest = answers.keys().next().value;
    if (oldest !== undefined) answers.delete(oldest);
  }
}

/**
 * A check that failed for these inputs is not asked again this session:
 * the card disappears, and a rate limit or an outage must not turn into a
 * retry on every render of the panel.
 */
export function intakeFailed(key: string): boolean {
  return failures.has(key);
}

export function rememberIntakeFailure(key: string): void {
  failures.add(key);
}

/** Test hook. */
export function forgetIntakeAnswers(): void {
  answers.clear();
  failures.clear();
}

// --- Acting on an answer --------------------------------------------------

/**
 * A conflict's identity across checks. A setting conflict is the same one
 * whatever the model words it; any other is the same only word for word.
 */
export function conflictKey(conflict: IntakeConflict): string {
  return conflict.kind === "setting"
    ? `setting:${conflict.suggestedSetting ?? ""}`
    : `${conflict.kind}:${conflict.message ?? ""}`;
}

export interface VenueCandidate {
  ref: Ref;
  category: ReferenceCategory;
}

/**
 * The references the check thinks are a photo of an empty real venue that
 * the card may offer to promote: still on the design, and the couple's own
 * upload (a pin or a library photo is somebody else's venue), minus the
 * ones they said are inspiration.
 */
export function venueCandidates(
  cached: CachedIntake,
  references: Record<ReferenceCategory, Ref[]>,
  dismissed: ReadonlySet<string>,
): VenueCandidate[] {
  const out: VenueCandidate[] = [];
  for (const index of cached.result.venueCandidateIndexes) {
    const slot = cached.slots[index];
    if (!slot || dismissed.has(slot.id)) continue;
    const ref = references[slot.category].find((r) => r.id === slot.id);
    if (!ref || ref.source !== "upload") continue;
    if (out.some((c) => c.ref.id === ref.id)) continue;
    out.push({ ref, category: slot.category });
  }
  return out;
}
