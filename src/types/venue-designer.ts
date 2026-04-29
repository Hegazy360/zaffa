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

export interface Ref {
  id: string;
  url: string;
  source: "inspiration" | "upload";
  sourceId?: string;
  thumbnailUrl?: string;
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
  size: Size;
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
  palette: { colors: [] },
  references: EMPTY_REFERENCES,
  styleNotes: "",
};

export const MAX_REFERENCES_PER_CATEGORY = 3;
export const MAX_TOTAL_REFERENCES = 10;
