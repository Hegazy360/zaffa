import { create } from "zustand";
import {
  DEFAULT_DESIGN,
  EMPTY_REFERENCES,
  MAX_REFERENCES_PER_CATEGORY,
  MAX_TOTAL_REFERENCES,
  REFERENCE_CATEGORIES,
  sizeFromGuestCount,
  type DesignDocument,
  type DesignPalette,
  type EventType,
  type Ref,
  type ReferenceCategory,
  type Setting,
  type Size,
  type VenuePhoto,
} from "@/types/venue-designer";

export type AddReferenceResult =
  | { ok: true }
  | { ok: false; reason: "duplicate" | "category_full" | "total_full" };

interface VenueDesignerState extends DesignDocument {
  setName: (name: string) => void;
  setEventType: (eventType: EventType) => void;
  setSetting: (setting: Setting) => void;
  setSize: (size: Size) => void;
  setGuestCount: (guestCount: number | null) => void;
  setPalette: (palette: DesignPalette) => void;
  setStyleNotes: (notes: string) => void;
  setVenuePhoto: (photo: VenuePhoto | null) => void;

  /**
   * The render version on screen, shared between the render panel and the
   * panels that act on "this version" (refine, decor plan, family vote).
   * Session state, never saved with the design: it is not part of
   * `serialize()`, and `reset()` / `deserialize()` clear it so a version
   * of one design can never be acted on from another.
   */
  activeRenderMediaId: string | null;
  setActiveRenderMediaId: (id: string | null) => void;

  addReference: (
    category: ReferenceCategory,
    ref: Ref
  ) => AddReferenceResult;
  removeReference: (category: ReferenceCategory, refId: string) => void;
  clearReferences: (category?: ReferenceCategory) => void;
  totalReferences: () => number;

  reset: () => void;
  serialize: () => DesignDocument;
  deserialize: (doc: Partial<DesignDocument>) => void;
}

function normalizeReferences(
  partial: Partial<DesignDocument["references"]> | undefined
): DesignDocument["references"] {
  return {
    overall_vibe: partial?.overall_vibe ?? [],
    tables: partial?.tables ?? [],
    flowers: partial?.flowers ?? [],
    lighting: partial?.lighting ?? [],
    venue_decor: partial?.venue_decor ?? [],
  };
}

export const useVenueDesignerStore = create<VenueDesignerState>((set, get) => ({
  ...DEFAULT_DESIGN,
  activeRenderMediaId: null,

  setName: (name) => set({ name }),
  setEventType: (eventType) => set({ eventType }),
  setSetting: (setting) => set({ setting }),
  setSize: (size) => set({ size }),
  // Setting guestCount also updates the coarse size bucket so the AI scene
  // generator sees a layout that matches the count without callers having
  // to remember to keep both in sync.
  setGuestCount: (guestCount) =>
    set({
      guestCount,
      size: guestCount != null ? sizeFromGuestCount(guestCount) : get().size,
    }),
  setPalette: (palette) => set({ palette }),
  setStyleNotes: (styleNotes) => set({ styleNotes }),
  setVenuePhoto: (venuePhoto) => set({ venuePhoto }),
  setActiveRenderMediaId: (activeRenderMediaId) => set({ activeRenderMediaId }),

  addReference: (category, ref) => {
    const refs = get().references;
    const current = refs[category];
    if (current.some((r) => r.id === ref.id)) {
      return { ok: false, reason: "duplicate" };
    }
    if (current.length >= MAX_REFERENCES_PER_CATEGORY) {
      return { ok: false, reason: "category_full" };
    }
    const total = REFERENCE_CATEGORIES.reduce(
      (n, c) => n + refs[c].length,
      0
    );
    if (total >= MAX_TOTAL_REFERENCES) {
      return { ok: false, reason: "total_full" };
    }
    set((s) => ({
      references: {
        ...s.references,
        [category]: [...s.references[category], ref],
      },
    }));
    return { ok: true };
  },

  removeReference: (category, refId) => {
    set((s) => ({
      references: {
        ...s.references,
        [category]: s.references[category].filter((r) => r.id !== refId),
      },
    }));
  },

  clearReferences: (category) => {
    if (!category) {
      set({ references: { ...EMPTY_REFERENCES } });
      return;
    }
    set((s) => ({
      references: { ...s.references, [category]: [] },
    }));
  },

  totalReferences: () => {
    const refs = get().references;
    return REFERENCE_CATEGORIES.reduce((n, c) => n + refs[c].length, 0);
  },

  reset: () =>
    set({
      ...DEFAULT_DESIGN,
      references: { ...EMPTY_REFERENCES },
      activeRenderMediaId: null,
    }),

  serialize: () => {
    const s = get();
    return {
      name: s.name,
      eventType: s.eventType,
      setting: s.setting,
      size: s.size,
      guestCount: s.guestCount,
      palette: s.palette,
      references: s.references,
      styleNotes: s.styleNotes ?? "",
      venuePhoto: s.venuePhoto,
    };
  },

  deserialize: (doc) => {
    const guestCount = doc.guestCount ?? null;
    set({
      name: doc.name ?? DEFAULT_DESIGN.name,
      eventType: doc.eventType ?? DEFAULT_DESIGN.eventType,
      setting: doc.setting ?? DEFAULT_DESIGN.setting,
      // If a precise count came back from the server, prefer the bucket it
      // implies so the in-memory size never drifts from the count.
      size:
        guestCount != null
          ? sizeFromGuestCount(guestCount)
          : doc.size ?? DEFAULT_DESIGN.size,
      guestCount,
      palette: doc.palette ?? { colors: [] },
      references: normalizeReferences(doc.references),
      styleNotes: doc.styleNotes ?? "",
      venuePhoto: doc.venuePhoto ?? null,
      activeRenderMediaId: null,
    });
  },
}));
