import type { DesignPalette } from "@/types/venue-designer";

export interface PalettePreset extends DesignPalette {
  id: string;
  name: string;
  description: string;
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "blush_gold",
    name: "Blush & Gold",
    description: "Romantic pinks warmed with soft golds.",
    colors: ["#F4D8D2", "#E8A0A0", "#C99B7C", "#C4A35A", "#FFFFFF"],
  },
  {
    id: "ivory_sage",
    name: "Ivory & Sage",
    description: "Soft neutrals with garden greenery.",
    colors: ["#F5EFE6", "#E8DCC4", "#B7C4A0", "#7C8A6B", "#3F4A37"],
  },
  {
    id: "midnight_pearl",
    name: "Midnight & Pearl",
    description: "Moody navy and inky blue with pearl accents.",
    colors: ["#0F1B33", "#1F3358", "#5C708F", "#D9D5C7", "#F5F2E8"],
  },
  {
    id: "terracotta_dust",
    name: "Terracotta & Dust",
    description: "Warm earthy desert tones.",
    colors: ["#C77A56", "#E2A77A", "#E9CDA6", "#A4926E", "#5E4A36"],
  },
  {
    id: "burgundy_rose",
    name: "Burgundy & Rose",
    description: "Rich jewel reds with dusty pink.",
    colors: ["#5C1E2C", "#8E2A3F", "#C46A7A", "#E8C4C4", "#F8EFE8"],
  },
  {
    id: "noir_emerald",
    name: "Noir & Emerald",
    description: "Black-tie elegance with emerald and gold.",
    colors: ["#0E0E10", "#143E2D", "#2E7B5A", "#C4A35A", "#F5F2E8"],
  },
];
