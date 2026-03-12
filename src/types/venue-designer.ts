export type ItemType =
  | "round_table"
  | "rectangular_table"
  | "chair"
  | "flower_vase"
  | "flower_centerpiece"
  | "tall_arrangement"
  | "arch"
  | "candelabra"
  | "candle_cluster"
  | "lantern"
  | "backdrop_panel"
  | "mirror_panel"
  | "garland"
  | "aisle_runner"
  | "stage";

export interface PlacedItem {
  id: string;
  type: ItemType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color?: string;
  variant?: string;
}

export type FloorType = "ceramic" | "marble" | "wood" | "grass" | "sand" | "concrete" | "custom";

export interface VenueConfig {
  width: number;
  length: number;
  height: number;
  floorType: FloorType;
  floorColor: string;
  wallColor: string;
}

export type ActiveTool = "select" | "translate" | "rotate" | "scale";

export interface DesignJSON {
  venue: VenueConfig;
  items: PlacedItem[];
}

export interface ItemCatalogEntry {
  type: ItemType;
  label: string;
  icon: string;
  category: "tables" | "seating" | "florals" | "lighting" | "decor" | "structure";
  defaultColor?: string;
}

export const ITEM_CATALOG: ItemCatalogEntry[] = [
  // Tables
  { type: "round_table", label: "Round Table", icon: "⬭", category: "tables" },
  { type: "rectangular_table", label: "Rect. Table", icon: "▬", category: "tables" },

  // Seating
  { type: "chair", label: "Chair", icon: "🪑", category: "seating" },

  // Florals
  { type: "flower_vase", label: "Flower Vase", icon: "🌸", category: "florals", defaultColor: "#e8a0bf" },
  { type: "flower_centerpiece", label: "Centerpiece", icon: "💐", category: "florals", defaultColor: "#d4899e" },
  { type: "tall_arrangement", label: "Tall Arrangement", icon: "🌷", category: "florals", defaultColor: "#c97b92" },
  { type: "arch", label: "Floral Arch", icon: "🌺", category: "florals", defaultColor: "#e8a0bf" },
  { type: "garland", label: "Garland", icon: "🌿", category: "florals", defaultColor: "#5a7247" },

  // Lighting
  { type: "candelabra", label: "Candelabra", icon: "🕯️", category: "lighting" },
  { type: "candle_cluster", label: "Candles", icon: "🕯️", category: "lighting" },
  { type: "lantern", label: "Lantern", icon: "🏮", category: "lighting", defaultColor: "#C4A35A" },

  // Decor
  { type: "backdrop_panel", label: "Backdrop", icon: "🎭", category: "decor", defaultColor: "#f5f0eb" },
  { type: "mirror_panel", label: "Mirror", icon: "🪞", category: "decor" },
  { type: "aisle_runner", label: "Aisle Runner", icon: "🎀", category: "decor", defaultColor: "#F5F0EB" },

  // Structure
  { type: "stage", label: "Stage / Kosha", icon: "🎪", category: "structure" },
];
