// Curated vibe catalog for the admin post generator.
//
// Vibes are short evocative descriptors used as the Pinterest search
// query AND interpolated into the image-gen prompt template. Weights
// drive a weighted-roulette pick when the admin doesn't supply one
// — biased toward MENA so roughly half of generations feel like the
// markets we actually serve.
//
// Adding a new vibe: just append to the list. The picker tolerates any
// length. Region tags exist for future filtering (e.g. "show me only
// european posts") but aren't surfaced in the UI yet.

export type VibeRegion = "mena" | "europe" | "asia" | "latam" | "global";

export interface Vibe {
  /** Lowercased free-text used verbatim as Pinterest query + prompt token. */
  name: string;
  region: VibeRegion;
  /** Roulette weight. Higher = more likely. MENA vibes get 3, others get 2. */
  weight: number;
}

export const VIBES: Vibe[] = [
  // MENA — heavier weight, larger pool. ~50% of generations should land here.
  { name: "riad courtyard", region: "mena", weight: 3 },
  { name: "cairo rooftop", region: "mena", weight: 3 },
  { name: "beirut garden", region: "mena", weight: 3 },
  { name: "siwa oasis", region: "mena", weight: 3 },
  { name: "gouna seaside", region: "mena", weight: 3 },
  { name: "fes medina", region: "mena", weight: 3 },
  { name: "amman olive grove", region: "mena", weight: 2 },
  { name: "doha pearl", region: "mena", weight: 2 },
  { name: "marrakech tile", region: "mena", weight: 3 },

  // Europe — modest pool, classic references.
  { name: "tuscan garden", region: "europe", weight: 2 },
  { name: "parisian salon", region: "europe", weight: 2 },
  { name: "amalfi terrace", region: "europe", weight: 2 },
  { name: "cotswolds chapel", region: "europe", weight: 2 },
  { name: "santorini cliff", region: "europe", weight: 2 },

  // Asia.
  { name: "kyoto teahouse", region: "asia", weight: 2 },
  { name: "udaipur palace", region: "asia", weight: 2 },
  { name: "bali jungle", region: "asia", weight: 2 },

  // LatAm.
  { name: "tulum palms", region: "latam", weight: 2 },
  { name: "oaxaca courtyard", region: "latam", weight: 2 },

  // Global / abstract.
  { name: "pampas grass dusk", region: "global", weight: 2 },
  { name: "candlelit cathedral", region: "global", weight: 2 },
  { name: "olive wreath table", region: "global", weight: 2 },
];

/**
 * Weighted-roulette pick. Stable for tests when an `rng` is supplied.
 */
export function pickVibe(rng: () => number = Math.random): Vibe {
  const total = VIBES.reduce((s, v) => s + v.weight, 0);
  let roll = rng() * total;
  for (const v of VIBES) {
    roll -= v.weight;
    if (roll <= 0) return v;
  }
  return VIBES[0];
}
