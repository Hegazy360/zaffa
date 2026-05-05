export type ReferenceCategory =
  | "overall_vibe"
  | "tables"
  | "flowers"
  | "lighting"
  | "venue_decor";

export const REFERENCE_CATEGORIES: ReferenceCategory[] = [
  "overall_vibe",
  "tables",
  "flowers",
  "lighting",
  "venue_decor",
];

export const REFERENCE_CATEGORY_LABELS: Record<ReferenceCategory, string> = {
  overall_vibe: "Overall vibe",
  tables: "Tables & seating",
  flowers: "Florals",
  lighting: "Lighting",
  venue_decor: "Decor & structure",
};

export const REFERENCE_CATEGORY_DESCRIPTIONS: Record<ReferenceCategory, string> = {
  overall_vibe:
    "The big-picture feeling of your event - moodboards or whole venues that capture the energy you want.",
  tables:
    "Table styles, linens, place settings, and seating arrangements you love.",
  flowers:
    "Centerpieces, arches, bouquets, hanging florals, and any greenery you'd like featured.",
  lighting:
    "Chandeliers, string lights, candles, uplighting - anything that sets the mood.",
  venue_decor:
    "Backdrops, signage, dance floors, drapery, and structural pieces that frame the space.",
};

export type EventType =
  | "wedding"
  | "engagement"
  | "birthday"
  | "corporate"
  | "other";

export type Setting = "indoor" | "outdoor" | "tent";

export type Size = "intimate" | "medium" | "large";

export const GUEST_COUNT_MIN = 2;
export const GUEST_COUNT_MAX = 10000;

// Quick-pick chips shown in the designer alongside the numeric input. These
// are intentionally evenly-spread sentinels (not bucket boundaries) so the
// couple can land on a sensible default with one tap and tweak from there.
export const GUEST_COUNT_PRESETS: readonly number[] = [
  30, 75, 120, 175, 250, 400,
];

// Map a precise guest count to one of the three coarse buckets the AI scene
// generator uses to pick a layout descriptor. Tuned so the boundaries match
// the labels we expose elsewhere ("up to ~50", "50-150", "150+").
export function sizeFromGuestCount(count: number | null | undefined): Size {
  if (count == null || !Number.isFinite(count) || count <= 0) return "medium";
  if (count <= 50) return "intimate";
  if (count <= 150) return "medium";
  return "large";
}

export interface Ref {
  id: string;
  url: string;
  source: "inspiration" | "upload" | "pinterest";
  sourceId?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  attribution?: string;
}

export interface DesignPalette {
  name?: string;
  colors: string[];
}

export type DesignReferences = Record<ReferenceCategory, Ref[]>;

export interface DesignDocument {
  name: string;
  eventType: EventType;
  setting: Setting;
  // Coarse bucket — kept for the AI scene generator. Derived from
  // `guestCount` whenever a precise count is set.
  size: Size;
  // Exact expected guest count. Optional so existing designs created before
  // this field was added still hydrate cleanly.
  guestCount: number | null;
  palette: DesignPalette;
  references: DesignReferences;
  styleNotes?: string;
}

export const EMPTY_REFERENCES: DesignReferences = {
  overall_vibe: [],
  tables: [],
  flowers: [],
  lighting: [],
  venue_decor: [],
};

export const DEFAULT_DESIGN: DesignDocument = {
  name: "Untitled Design",
  eventType: "wedding",
  setting: "indoor",
  size: "medium",
  guestCount: null,
  palette: { colors: [] },
  references: EMPTY_REFERENCES,
  styleNotes: "",
};

export const MAX_REFERENCES_PER_CATEGORY = 3;
export const MAX_TOTAL_REFERENCES = 10;
