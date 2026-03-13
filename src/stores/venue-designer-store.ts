import { create } from "zustand";
import type {
  PlacedItem,
  ItemType,
  VenueConfig,
  ActiveTool,
  DesignJSON,
} from "@/types/venue-designer";

interface HistoryEntry {
  items: PlacedItem[];
  venue: VenueConfig;
}

interface VenueDesignerState {
  venue: VenueConfig;
  setVenue: (v: Partial<VenueConfig>) => void;

  items: PlacedItem[];
  addItem: (type: ItemType, position: [number, number, number]) => string;
  updateItem: (id: string, patch: Partial<PlacedItem>) => void;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;

  selectedId: string | null;
  select: (id: string | null) => void;

  activeTool: ActiveTool;
  setTool: (tool: ActiveTool) => void;

  placingType: ItemType | null;
  startPlacing: (type: ItemType) => void;
  cancelPlacing: () => void;

  past: HistoryEntry[];
  future: HistoryEntry[];
  undo: () => void;
  redo: () => void;

  clearScene: () => void;

  serialize: () => DesignJSON;
  deserialize: (data: DesignJSON) => void;
}

let nextId = 1;
function genId() {
  return `item_${nextId++}_${Date.now().toString(36)}`;
}

function snapshot(state: VenueDesignerState): HistoryEntry {
  return {
    items: state.items.map((i) => ({ ...i })),
    venue: { ...state.venue },
  };
}

const DEFAULT_COLORS: Partial<Record<ItemType, string>> = {
  // Tables
  cocktail_table: "#FFFFFF",
  sweetheart_table: "#FAF0E6",
  gift_table: "#FAF0E6",
  bar_counter: "#3D2B1F",
  buffet_table: "#FFFFFF",
  // Seating
  ghost_chair: "#E8F4FF",
  lounge_sofa: "#8B6F8A",
  // Florals
  flower_wall: "#e8a0bf",
  flower_vase: "#e8a0bf",
  flower_centerpiece: "#d4899e",
  tall_arrangement: "#c97b92",
  arch: "#e8a0bf",
  garland: "#5a7247",
  wreath: "#e8a0bf",
  topiary: "#4A7A3D",
  petal_scatter: "#e8a0bf",
  potted_plant: "#4A7A3D",
  // Lighting
  lantern: "#C4A35A",
  floor_uplight: "#FFD700",
  // Decor
  backdrop_panel: "#f5f0eb",
  aisle_runner: "#F5F0EB",
  balloon_arch: "#FF6B8A",
  balloon_column: "#FF6B8A",
  welcome_sign: "#F5F0EB",
  cake_stand: "#FEFEFE",
  photo_frame: "#C4A35A",
  neon_sign: "#FF6B8A",
  fabric_drape: "#F5E6D3",
  dessert_table: "#FAF0E6",
  dj_booth: "#2A2A2A",
  // Structure
  column_pillar: "#F5F0EB",
  pergola: "#F5E6D3",
  dance_floor: "#2A2A2A",
};

export const useVenueDesignerStore = create<VenueDesignerState>((set, get) => ({
  venue: { width: 20, length: 30, height: 5, floorType: "ceramic", floorColor: "#E8DDD0", wallColor: "#FAF0E6" },
  setVenue: (v) => {
    const prev = snapshot(get());
    set((s) => ({
      venue: { ...s.venue, ...v },
      past: [...s.past, prev],
      future: [],
    }));
  },

  items: [],
  addItem: (type, position) => {
    const id = genId();
    const prev = snapshot(get());
    set((s) => ({
      items: [
        ...s.items,
        {
          id,
          type,
          position,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: DEFAULT_COLORS[type],
          variant: type === "arch" ? "round" : undefined,
        },
      ],
      placingType: null,
      selectedId: id,
      activeTool: "translate",
      past: [...s.past, prev],
      future: [],
    }));
    return id;
  },

  updateItem: (id, patch) => {
    const prev = snapshot(get());
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      past: [...s.past, prev],
      future: [],
    }));
  },

  removeItem: (id) => {
    const prev = snapshot(get());
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      past: [...s.past, prev],
      future: [],
    }));
  },

  duplicateItem: (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const newId = genId();
    const prev = snapshot(get());
    set((s) => ({
      items: [
        ...s.items,
        {
          ...item,
          id: newId,
          position: [
            item.position[0] + 1,
            item.position[1],
            item.position[2] + 1,
          ] as [number, number, number],
        },
      ],
      selectedId: newId,
      past: [...s.past, prev],
      future: [],
    }));
  },

  selectedId: null,
  select: (id) => set({ selectedId: id }),

  activeTool: "select",
  setTool: (tool) => set({ activeTool: tool }),

  placingType: null,
  startPlacing: (type) =>
    set({ placingType: type, selectedId: null, activeTool: "select" }),
  cancelPlacing: () => set({ placingType: null }),

  past: [],
  future: [],
  undo: () => {
    const { past, items, venue } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      items: prev.items,
      venue: prev.venue,
      past: past.slice(0, -1),
      future: [{ items, venue }, ...get().future],
      selectedId: null,
    });
  },
  redo: () => {
    const { future, items, venue } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      items: next.items,
      venue: next.venue,
      future: future.slice(1),
      past: [...get().past, { items, venue }],
      selectedId: null,
    });
  },

  clearScene: () => {
    const prev = snapshot(get());
    set({
      items: [],
      selectedId: null,
      placingType: null,
      past: [...get().past, prev],
      future: [],
    });
  },

  serialize: () => ({
    venue: get().venue,
    items: get().items,
  }),

  deserialize: (data) => {
    const items = data.items.map((item) => ({
      ...item,
      id: genId(),
    }));
    set({
      venue: data.venue,
      items,
      selectedId: null,
      placingType: null,
      past: [],
      future: [],
    });
  },
}));
