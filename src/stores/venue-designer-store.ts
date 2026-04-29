import { create } from "zustand";
import {
  DEFAULT_DESIGN,
  EMPTY_REFERENCES,
  MAX_REFERENCES_PER_CATEGORY,
  type DesignDocument,
  type DesignPalette,
  type EventType,
  type Ref,
  type ReferenceCategory,
  type Setting,
  type Size,
} from "@/types/venue-designer";

interface VenueDesignerState extends DesignDocument {
  setName: (name: string) => void;
  setEventType: (eventType: EventType) => void;
  setSetting: (setting: Setting) => void;
  setSize: (size: Size) => void;
  setPalette: (palette: DesignPalette) => void;
  setStyleNotes: (notes: string) => void;

  addReference: (category: ReferenceCategory, ref: Ref) => boolean;
  removeReference: (category: ReferenceCategory, refId: string) => void;
  clearReferences: (category?: ReferenceCategory) => void;

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

  setName: (name) => set({ name }),
  setEventType: (eventType) => set({ eventType }),
  setSetting: (setting) => set({ setting }),
  setSize: (size) => set({ size }),
  setPalette: (palette) => set({ palette }),
  setStyleNotes: (styleNotes) => set({ styleNotes }),

  addReference: (category, ref) => {
    const current = get().references[category];
    if (current.some((r) => r.id === ref.id)) return false;
    if (current.length >= MAX_REFERENCES_PER_CATEGORY) return false;
    set((s) => ({
      references: {
        ...s.references,
        [category]: [...s.references[category], ref],
      },
    }));
    return true;
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

  reset: () => set({ ...DEFAULT_DESIGN, references: { ...EMPTY_REFERENCES } }),

  serialize: () => {
    const s = get();
    return {
      name: s.name,
      eventType: s.eventType,
      setting: s.setting,
      size: s.size,
      palette: s.palette,
      references: s.references,
      styleNotes: s.styleNotes ?? "",
    };
  },

  deserialize: (doc) => {
    set({
      name: doc.name ?? DEFAULT_DESIGN.name,
      eventType: doc.eventType ?? DEFAULT_DESIGN.eventType,
      setting: doc.setting ?? DEFAULT_DESIGN.setting,
      size: doc.size ?? DEFAULT_DESIGN.size,
      palette: doc.palette ?? { colors: [] },
      references: normalizeReferences(doc.references),
      styleNotes: doc.styleNotes ?? "",
    });
  },
}));
