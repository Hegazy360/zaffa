export type ItemType =
  // Tables
  | "round_table"
  | "rectangular_table"
  | "cocktail_table"
  | "sweetheart_table"
  | "gift_table"
  | "bar_counter"
  | "buffet_table"
  // Seating
  | "chair"
  | "chiavari_chair"
  | "crossback_chair"
  | "ghost_chair"
  | "bench"
  | "lounge_sofa"
  // Florals
  | "flower_wall"
  | "flower_vase"
  | "flower_centerpiece"
  | "tall_arrangement"
  | "arch"
  | "garland"
  | "wreath"
  | "topiary"
  | "petal_scatter"
  | "potted_plant"
  // Lighting
  | "candelabra"
  | "candle_cluster"
  | "lantern"
  | "floor_uplight"
  // Decor
  | "backdrop_panel"
  | "mirror_panel"
  | "aisle_runner"
  | "balloon_arch"
  | "balloon_column"
  | "welcome_sign"
  | "cake_stand"
  | "photo_frame"
  | "neon_sign"
  | "fabric_drape"
  | "dessert_table"
  | "dj_booth"
  // Structure
  | "stage"
  | "column_pillar"
  | "pergola"
  | "dance_floor";

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
  { type: "cocktail_table", label: "Cocktail Table", icon: "🍸", category: "tables", defaultColor: "#FFFFFF" },
  { type: "sweetheart_table", label: "Sweetheart Table", icon: "💕", category: "tables", defaultColor: "#FAF0E6" },
  { type: "gift_table", label: "Gift Table", icon: "🎁", category: "tables", defaultColor: "#FAF0E6" },
  { type: "bar_counter", label: "Bar Counter", icon: "🍷", category: "tables", defaultColor: "#3D2B1F" },
  { type: "buffet_table", label: "Buffet Table", icon: "🍽️", category: "tables", defaultColor: "#FFFFFF" },

  // Seating
  { type: "chair", label: "Chair", icon: "🪑", category: "seating" },
  { type: "chiavari_chair", label: "Chiavari Chair", icon: "🪑", category: "seating" },
  { type: "crossback_chair", label: "Crossback Chair", icon: "🪵", category: "seating" },
  { type: "ghost_chair", label: "Ghost Chair", icon: "💎", category: "seating", defaultColor: "#E8F4FF" },
  { type: "bench", label: "Bench", icon: "🛋️", category: "seating" },
  { type: "lounge_sofa", label: "Lounge Sofa", icon: "🛋️", category: "seating", defaultColor: "#8B6F8A" },

  // Florals
  { type: "flower_wall", label: "Flower Wall", icon: "🌸", category: "florals", defaultColor: "#e8a0bf" },
  { type: "flower_vase", label: "Flower Vase", icon: "🌸", category: "florals", defaultColor: "#e8a0bf" },
  { type: "flower_centerpiece", label: "Centerpiece", icon: "💐", category: "florals", defaultColor: "#d4899e" },
  { type: "tall_arrangement", label: "Tall Arrangement", icon: "🌷", category: "florals", defaultColor: "#c97b92" },
  { type: "arch", label: "Floral Arch", icon: "🌺", category: "florals", defaultColor: "#e8a0bf" },
  { type: "garland", label: "Garland", icon: "🌿", category: "florals", defaultColor: "#5a7247" },
  { type: "wreath", label: "Wreath", icon: "🌿", category: "florals", defaultColor: "#e8a0bf" },
  { type: "topiary", label: "Topiary", icon: "🌳", category: "florals", defaultColor: "#4A7A3D" },
  { type: "petal_scatter", label: "Petal Scatter", icon: "🌹", category: "florals", defaultColor: "#e8a0bf" },
  { type: "potted_plant", label: "Potted Plant", icon: "🪴", category: "florals", defaultColor: "#4A7A3D" },

  // Lighting
  { type: "candelabra", label: "Candelabra", icon: "🕯️", category: "lighting" },
  { type: "candle_cluster", label: "Candles", icon: "🕯️", category: "lighting" },
  { type: "lantern", label: "Lantern", icon: "🏮", category: "lighting", defaultColor: "#C4A35A" },
  { type: "floor_uplight", label: "Floor Uplight", icon: "🔆", category: "lighting", defaultColor: "#FFD700" },

  // Decor
  { type: "backdrop_panel", label: "Backdrop", icon: "🎭", category: "decor", defaultColor: "#f5f0eb" },
  { type: "mirror_panel", label: "Mirror", icon: "🪞", category: "decor" },
  { type: "aisle_runner", label: "Aisle Runner", icon: "🎀", category: "decor", defaultColor: "#F5F0EB" },
  { type: "balloon_arch", label: "Balloon Arch", icon: "🎈", category: "decor", defaultColor: "#FF6B8A" },
  { type: "balloon_column", label: "Balloon Column", icon: "🎈", category: "decor", defaultColor: "#FF6B8A" },
  { type: "welcome_sign", label: "Welcome Sign", icon: "📋", category: "decor", defaultColor: "#F5F0EB" },
  { type: "cake_stand", label: "Cake Stand", icon: "🎂", category: "decor", defaultColor: "#FEFEFE" },
  { type: "photo_frame", label: "Photo Frame", icon: "🖼️", category: "decor", defaultColor: "#C4A35A" },
  { type: "neon_sign", label: "Neon Sign", icon: "💗", category: "decor", defaultColor: "#FF6B8A" },
  { type: "fabric_drape", label: "Fabric Drape", icon: "🪡", category: "decor", defaultColor: "#F5E6D3" },
  { type: "dessert_table", label: "Dessert Table", icon: "🧁", category: "decor", defaultColor: "#FAF0E6" },
  { type: "dj_booth", label: "DJ Booth", icon: "🎧", category: "decor", defaultColor: "#2A2A2A" },

  // Structure
  { type: "stage", label: "Stage / Kosha", icon: "🎪", category: "structure" },
  { type: "column_pillar", label: "Column Pillar", icon: "🏛️", category: "structure", defaultColor: "#F5F0EB" },
  { type: "pergola", label: "Pergola", icon: "⛩️", category: "structure", defaultColor: "#F5E6D3" },
  { type: "dance_floor", label: "Dance Floor", icon: "💃", category: "structure", defaultColor: "#2A2A2A" },
];
