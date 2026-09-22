// The costed decor plan (F4, "What it takes to build this").
//
// A render is read into a fixed vocabulary (`decor-analysis.ts`); this file
// turns that plus the couple's guest count into an itemised plan with
// low/high ranges in their market. Pure on purpose: no server imports, so the
// designer, the lookbook and the admin brief all price a design the same way,
// and a guest-count change re-prices it without another model call.
//
// ---------------------------------------------------------------------------
// Where the numbers come from (research pass, September 2026; the full notes
// with links live in the release's research map, summarised here so the table
// can be audited from this file alone).
//
// Markets and currencies:
//   EG  Egypt, EGP.
//   AE  UAE, AED. Also used for KW, QA, BH and OM, where we have no separate
//       data and AED prices are the nearest Gulf reference.
//   SA  Saudi Arabia, SAR.
//   EU  France / Western Europe, EUR. Used for European countries.
//   US  Everything else, USD. DERIVED: EU prices x 1.1, shown as an estimate.
//
// Sources by market (S-numbers from the research map):
//   EG  Evenza decor page (2026-05), Egyptian Streets (2025-01, table + 10
//       chairs for 500 EGP), Belbeis hall listing, Vetogate / Dar al-Hilal
//       (rose stems, 2025), Al Qarar Al Masry (bouquets, 2026-02), CalcMoney
//       (2026-01), kosha offers on Facebook/TikTok (2025).
//   AE  Zuvees (2026-01), CateringServiceDubai (2026-06), Sabir Events and
//       Hafla live listings (2026-09), R Events (2024-09), Events Master,
//       Rentin.ae, TentProject (2026), FirenzeFlora, Olga Events (2026).
//   SA  Amwaj Al-Hadeel (chairs and tables, 2026-07), Munasabat Riyadh
//       (kosha, tent), E3arah, Value Events, KGR Events (2026-03), Talal
//       Store / flowers.sa (table arrangements).
//   EU  LocationTente (2026-05), Organiser-son-mariage (2026-03), Izifete
//       (2026-05), Ditesoui ("from" prices), Mariee.fr (2023-11), LDS
//       Location, Leboncoin, Mariages.net (2026-03).
//
// Which rows are ASSUMPTIONS rather than sourced:
//   EG  Almost all of them. Egyptian vendors quote on WhatsApp, so public
//       per-item prices barely exist. Only chair and table rental are sourced;
//       the kosha floor (650-1,000 EGP budget koshas) and bouquet prices anchor
//       the rest. Unsourced EG rows use the UAE AED price x 2 to 4, rounded,
//       the ratio the sourced chair/table rows showed. Replace with concierge
//       quotes before trusting them.
//   AE  Candles, signage, the chandelier high end and the table low end.
//       Ceiling draping is derived from a 3-5k AED basic ceiling over about
//       200-300 m2.
//   SA  Arch, entrance, tall centrepieces, linens, candles, chandeliers,
//       lighting, fairy lights, draping, dance floor, signage, and the high
//       ends of kosha, low centrepieces and tent. Unsourced SA rows use the
//       UAE price at about 1:1 in SAR.
//   EU  Kosha/backdrop high end (head-table decor, not a MENA kosha), entrance
//       high end, tall centrepiece high end, runners.
//
// Quantity rules (also assumptions, stated to the couple in the plan):
//   tables     ceil(guests / guests per table) + 1 head table. 10 per table
//              everywhere except EU (8).
//   area       guests x 1.5 m2 with a dance floor, else x 1.2 m2.
//   and see `computeDecorPlan` for each line.
// ---------------------------------------------------------------------------

import { EU_MEMBER_STATES } from "@/lib/vision-pack-pricing";
import type { ChairStyle, DecorAnalysis, FlowerKind, TableShape } from "@/lib/decor-analysis";

export const DECOR_MARKETS = ["EG", "AE", "SA", "EU", "US"] as const;
export type DecorMarket = (typeof DECOR_MARKETS)[number];

export const MARKET_CURRENCY: Record<DecorMarket, string> = {
  EG: "EGP",
  AE: "AED",
  SA: "SAR",
  EU: "EUR",
  US: "USD",
};

export const GUESTS_PER_TABLE: Record<DecorMarket, number> = {
  EG: 10,
  AE: 10,
  SA: 10,
  EU: 8,
  US: 10,
};

/** US prices are EU prices times this, and labelled an estimate. */
const US_FROM_EU = 1.1;

export const DECOR_ITEM_KEYS = [
  "kosha_stage",
  "ceremony_arch",
  "entrance",
  "centerpiece_low",
  "centerpiece_tall",
  "tablecloth",
  "table_runner",
  "chair_rental",
  "table_rental",
  "candles",
  "chandelier",
  "lighting_rig",
  "string_lights",
  "ceiling_draping",
  "dance_floor",
  "signage",
  "tent",
] as const;
export type DecorItemKey = (typeof DECOR_ITEM_KEYS)[number];

export type DecorUnit = "setup" | "piece" | "table" | "chair" | "event" | "m" | "m2";

type Range = readonly [lo: number, hi: number];
type SourcedMarket = Exclude<DecorMarket, "US">;

interface CatalogueRow {
  unit: DecorUnit;
  /** Per-unit low/high in each sourced market's currency. */
  prices: Record<SourcedMarket, Range>;
  /** Floral lines narrow with the floral density the render shows. */
  floral?: boolean;
}

export const DECOR_CATALOGUE: Record<DecorItemKey, CatalogueRow> = {
  kosha_stage: {
    unit: "setup",
    floral: true,
    prices: { EG: [15000, 120000], AE: [7500, 80000], SA: [2000, 40000], EU: [210, 1500] },
  },
  ceremony_arch: {
    unit: "piece",
    floral: true,
    prices: { EG: [5000, 40000], AE: [1600, 30000], SA: [1500, 20000], EU: [300, 2500] },
  },
  entrance: {
    unit: "setup",
    floral: true,
    prices: { EG: [5000, 50000], AE: [5000, 30000], SA: [2000, 20000], EU: [150, 1200] },
  },
  centerpiece_low: {
    unit: "table",
    floral: true,
    prices: { EG: [800, 3000], AE: [200, 1000], SA: [150, 900], EU: [35, 95] },
  },
  centerpiece_tall: {
    unit: "table",
    floral: true,
    prices: { EG: [2500, 9000], AE: [375, 5000], SA: [400, 3000], EU: [110, 250] },
  },
  tablecloth: {
    unit: "table",
    prices: { EG: [50, 250], AE: [5, 60], SA: [15, 60], EU: [5, 10] },
  },
  table_runner: {
    unit: "table",
    prices: { EG: [75, 200], AE: [35, 50], SA: [20, 50], EU: [3, 10] },
  },
  chair_rental: {
    unit: "chair",
    prices: { EG: [12, 100], AE: [10, 45], SA: [10, 50], EU: [2.5, 8] },
  },
  table_rental: {
    unit: "table",
    prices: { EG: [120, 500], AE: [50, 450], SA: [30, 60], EU: [10, 25] },
  },
  candles: {
    unit: "table",
    prices: { EG: [150, 800], AE: [50, 400], SA: [40, 300], EU: [15, 40] },
  },
  chandelier: {
    unit: "piece",
    prices: { EG: [800, 4000], AE: [300, 1500], SA: [250, 1200], EU: [15, 55] },
  },
  lighting_rig: {
    unit: "event",
    prices: { EG: [6000, 30000], AE: [2000, 8000], SA: [2000, 10000], EU: [400, 3000] },
  },
  string_lights: {
    unit: "m",
    prices: { EG: [20, 60], AE: [8, 15], SA: [5, 10], EU: [3, 6] },
  },
  ceiling_draping: {
    unit: "m2",
    prices: { EG: [25, 100], AE: [10, 25], SA: [10, 25], EU: [9, 15] },
  },
  dance_floor: {
    unit: "m2",
    prices: { EG: [200, 700], AE: [100, 215], SA: [100, 200], EU: [12, 32] },
  },
  signage: {
    unit: "piece",
    prices: { EG: [500, 4000], AE: [250, 1500], SA: [150, 1500], EU: [110, 180] },
  },
  tent: {
    unit: "m2",
    prices: { EG: [100, 600], AE: [35, 250], SA: [60, 250], EU: [12, 48] },
  },
};

/**
 * Non-EU European countries priced as the EU market. EUR is not their
 * currency everywhere (GB, CH, NO), but Western European decor prices are the
 * closest reference we have, and a couple there reads EUR without effort.
 */
const OTHER_EUROPE: ReadonlySet<string> = new Set([
  "GB", "CH", "NO", "IS", "LI", "MC", "AD", "SM", "VA",
]);

const GULF_ON_AED: ReadonlySet<string> = new Set(["AE", "KW", "QA", "BH", "OM"]);

/** The pricing market for an ISO-3166 alpha-2 country; USD for the rest. */
export function marketForCountry(iso2: string | null | undefined): DecorMarket {
  const code = (iso2 ?? "").trim().toUpperCase();
  if (code === "EG") return "EG";
  if (code === "SA") return "SA";
  if (GULF_ON_AED.has(code)) return "AE";
  if (EU_MEMBER_STATES.has(code) || OTHER_EUROPE.has(code)) return "EU";
  return "US";
}

export function isDecorMarket(value: unknown): value is DecorMarket {
  return typeof value === "string" && (DECOR_MARKETS as readonly string[]).includes(value);
}

/**
 * Guests assumed when the couple never gave a count, by the size bucket the
 * render was made for. Same numbers the scene generator describes to the
 * image model ("about 30", "about 100", "200+"), so the plan prices the room
 * the couple is looking at.
 */
export const GUESTS_BY_SIZE: Record<string, number> = {
  intimate: 30,
  medium: 100,
  large: 200,
};

/** Detail tags shown next to a line, localised by the UI. */
export type DecorItemDetail =
  | { kind: "chair"; value: ChairStyle }
  | { kind: "table"; value: TableShape }
  | { kind: "flower"; value: FlowerKind };

export interface DecorPlanItem {
  key: DecorItemKey;
  qty: number;
  unit: DecorUnit;
  /** Per-unit range, after any density adjustment. */
  unitLo: number;
  unitHi: number;
  /** Line range: qty x unit, rounded outward to two significant figures. */
  lo: number;
  hi: number;
  details: DecorItemDetail[];
}

/** Keys of the plain-language assumptions the UI shows under the plan. */
export type DecorAssumption =
  | "guests_from_size"
  | "tables"
  | "area"
  | "floral_light"
  | "floral_lush"
  | "venue_package"
  | "eg_estimates"
  | "us_estimate"
  | "season_eg"
  | "season_eu"
  | "not_included";

export interface DecorPlan {
  market: DecorMarket;
  currency: string;
  items: DecorPlanItem[];
  totals: { lo: number; hi: number };
  guestCount: number;
  /** True when `guestCount` came from the size bucket, not the couple. */
  guestCountAssumed: boolean;
  /** Guest tables, not counting the head table. */
  tables: number;
  guestsPerTable: number;
  areaM2: number;
  areaPerGuest: number;
  assumptions: DecorAssumption[];
}

export interface DecorPlanInput {
  guestCount: number | null | undefined;
  /** Size bucket, used only when `guestCount` is missing. */
  size?: string | null;
  setting: string | null | undefined;
  market: DecorMarket;
}

/**
 * Round outward to two significant figures, so a range always contains the
 * exact product and reads like an estimate (12,000 to 95,000, not 11,873 to
 * 94,512). Below 100 it rounds to whole units, which keeps EUR runners at 3
 * rather than 0.
 */
export function roundMoney(value: number, direction: "down" | "up"): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = value < 100 ? 1 : 10 ** (Math.floor(Math.log10(value)) - 1);
  const scaled = value / step;
  // Float noise (2.5 * 3 = 7.499999...) must not push a round number over.
  const nudged = direction === "down" ? scaled + 1e-9 : scaled - 1e-9;
  const rounded = direction === "down" ? Math.floor(nudged) : Math.ceil(nudged);
  return rounded * step;
}

function unitPrice(key: DecorItemKey, market: DecorMarket): Range {
  const row = DECOR_CATALOGUE[key];
  if (market === "US") {
    const [lo, hi] = row.prices.EU;
    return [round2(lo * US_FROM_EU), round2(hi * US_FROM_EU)];
  }
  return row.prices[market];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lower or upper half of a range, for density read from the render. */
function half(range: Range, which: "lower" | "upper" | "all"): Range {
  const [lo, hi] = range;
  const mid = round2((lo + hi) / 2);
  if (which === "lower") return [lo, mid];
  if (which === "upper") return [mid, hi];
  return range;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * The itemised plan for one render.
 *
 * Every quantity is a rule on the guest count and what the render shows; the
 * model contributes only the booleans and enums in `DecorAnalysis`. Lines
 * with a zero quantity are dropped, so a render with no dance floor shows no
 * dance floor.
 */
export function computeDecorPlan(
  analysis: DecorAnalysis,
  input: DecorPlanInput,
): DecorPlan {
  const { market } = input;
  const guestCountAssumed = !(
    typeof input.guestCount === "number" &&
    Number.isFinite(input.guestCount) &&
    input.guestCount > 0
  );
  const guests = guestCountAssumed
    ? GUESTS_BY_SIZE[input.size ?? ""] ?? GUESTS_BY_SIZE.medium
    : Math.max(1, Math.round(input.guestCount as number));

  const setting = input.setting ?? "indoor";
  const guestsPerTable = GUESTS_PER_TABLE[market];
  const tables = Math.ceil(guests / guestsPerTable);
  // Every table is dressed alike, the head table included.
  const dressed = tables + 1;
  const areaPerGuest = analysis.has_dance_floor ? 1.5 : 1.2;
  const areaM2 = Math.ceil(guests * areaPerGuest);

  const floralHalf =
    analysis.floral_density === "light"
      ? "lower"
      : analysis.floral_density === "lush"
        ? "upper"
        : "all";

  const tallCount =
    analysis.centerpiece === "tall"
      ? dressed
      : analysis.centerpiece === "mixed"
        ? Math.ceil(dressed / 2)
        : 0;
  const lowCount =
    analysis.centerpiece === "low"
      ? dressed
      : analysis.centerpiece === "mixed"
        ? dressed - tallCount
        : 0;

  const flowerDetails: DecorItemDetail[] = analysis.flowers
    .filter((f) => f !== "other")
    .map((value) => ({ kind: "flower", value }));

  const lines: Array<{
    key: DecorItemKey;
    qty: number;
    range?: "lower" | "upper" | "all";
    details?: DecorItemDetail[];
  }> = [
    { key: "kosha_stage", qty: analysis.has_stage ? 1 : 0 },
    { key: "ceremony_arch", qty: analysis.has_arch ? 1 : 0 },
    { key: "entrance", qty: analysis.has_entrance_decor ? 1 : 0 },
    { key: "centerpiece_low", qty: lowCount, details: flowerDetails },
    { key: "centerpiece_tall", qty: tallCount, details: flowerDetails },
    { key: "tablecloth", qty: analysis.linens === "floor_length" ? dressed : 0 },
    { key: "table_runner", qty: analysis.linens === "runner_only" ? dressed : 0 },
    {
      key: "chair_rental",
      qty: guests,
      details:
        analysis.chair_style === "other"
          ? []
          : [{ kind: "chair", value: analysis.chair_style }],
    },
    {
      key: "table_rental",
      qty: dressed,
      details: [{ kind: "table", value: analysis.table_shape }],
    },
    {
      key: "candles",
      qty: analysis.candle_density === "none" ? 0 : dressed,
      range: analysis.candle_density === "lots" ? "upper" : "lower",
    },
    {
      key: "chandelier",
      qty: analysis.has_chandeliers ? Math.ceil(areaM2 / 40) : 0,
    },
    // A smaller room needs less rig: under 150 guests, the lower half.
    { key: "lighting_rig", qty: 1, range: guests < 150 ? "lower" : "all" },
    {
      key: "string_lights",
      qty: analysis.has_string_lights ? Math.ceil(areaM2 * 0.6) : 0,
    },
    {
      // Draping needs a ceiling: never outdoors, whatever the render shows.
      key: "ceiling_draping",
      qty: analysis.has_draping && setting !== "outdoor" ? areaM2 : 0,
    },
    {
      key: "dance_floor",
      qty: analysis.has_dance_floor ? clamp(Math.round(guests * 0.2), 16, 100) : 0,
    },
    // Welcome sign and seating chart, plus a second chart for a big room.
    { key: "signage", qty: 2 + (tables > 15 ? 1 : 0) },
    { key: "tent", qty: setting === "tent" ? areaM2 : 0 },
  ];

  const items: DecorPlanItem[] = [];
  for (const line of lines) {
    if (line.qty <= 0) continue;
    const row = DECOR_CATALOGUE[line.key];
    const base = unitPrice(line.key, market);
    const [unitLo, unitHi] = half(
      base,
      line.range ?? (row.floral ? floralHalf : "all"),
    );
    items.push({
      key: line.key,
      qty: line.qty,
      unit: row.unit,
      unitLo,
      unitHi,
      lo: roundMoney(line.qty * unitLo, "down"),
      hi: roundMoney(line.qty * unitHi, "up"),
      details: line.details ?? [],
    });
  }

  const totals = {
    lo: roundMoney(
      items.reduce((sum, i) => sum + i.lo, 0),
      "down",
    ),
    hi: roundMoney(
      items.reduce((sum, i) => sum + i.hi, 0),
      "up",
    ),
  };

  const has = (key: DecorItemKey) => items.some((i) => i.key === key);
  const hasFloral = items.some((i) => DECOR_CATALOGUE[i.key].floral);
  const usesArea =
    has("chandelier") || has("string_lights") || has("ceiling_draping") || has("tent");

  const assumptions: DecorAssumption[] = [];
  if (guestCountAssumed) assumptions.push("guests_from_size");
  assumptions.push("tables");
  if (usesArea) assumptions.push("area");
  if (hasFloral && floralHalf === "lower") assumptions.push("floral_light");
  if (hasFloral && floralHalf === "upper") assumptions.push("floral_lush");
  assumptions.push("venue_package");
  if (market === "EG") assumptions.push("eg_estimates", "season_eg");
  if (market === "EU") assumptions.push("season_eu");
  if (market === "US") assumptions.push("us_estimate");
  assumptions.push("not_included");

  return {
    market,
    currency: MARKET_CURRENCY[market],
    items,
    totals,
    guestCount: guests,
    guestCountAssumed,
    tables,
    guestsPerTable,
    areaM2,
    areaPerGuest,
    assumptions,
  };
}

/** The market list the UI switcher offers, in display order. */
export const DECOR_MARKET_OPTIONS = DECOR_MARKETS.map((id) => ({
  id,
  currency: MARKET_CURRENCY[id],
}));
