import { describe, expect, it } from "vitest";
import {
  DECOR_CATALOGUE,
  DECOR_ITEM_KEYS,
  DECOR_MARKETS,
  GUESTS_PER_TABLE,
  MARKET_CURRENCY,
  computeDecorPlan,
  isDecorMarket,
  marketForCountry,
  roundMoney,
  type DecorItemKey,
  type DecorMarket,
  type DecorPlan,
} from "@/lib/decor-pricing";
import {
  readStoredDecor,
  withStoredDecor,
  type DecorAnalysis,
} from "@/lib/decor-analysis";

/**
 * The costed plan is a money surface: a couple in Cairo reads these ranges
 * next to a decorator's WhatsApp quote. Every quantity comes from a rule on
 * the guest count, so the rules are pinned here one by one, and the ranges
 * are checked to always contain the exact product they round.
 */

const BASE: DecorAnalysis = {
  table_shape: "round",
  centerpiece: "low",
  has_stage: true,
  has_arch: false,
  has_entrance_decor: true,
  has_dance_floor: false,
  has_draping: false,
  has_chandeliers: false,
  has_string_lights: false,
  candle_density: "none",
  floral_density: "medium",
  flowers: ["rose", "hydrangea"],
  linens: "floor_length",
  chair_style: "chiavari",
  questions: [],
};

function plan(
  overrides: Partial<DecorAnalysis> = {},
  input: Partial<Parameters<typeof computeDecorPlan>[1]> = {},
): DecorPlan {
  return computeDecorPlan(
    { ...BASE, ...overrides },
    { guestCount: 150, setting: "indoor", market: "EG", ...input },
  );
}

function item(p: DecorPlan, key: DecorItemKey) {
  return p.items.find((i) => i.key === key);
}

describe("marketForCountry", () => {
  it.each([
    ["EG", "EG"],
    ["eg", "EG"],
    [" SA ", "SA"],
    ["AE", "AE"],
    ["KW", "AE"],
    ["QA", "AE"],
    ["BH", "AE"],
    ["OM", "AE"],
    ["FR", "EU"],
    ["DE", "EU"],
    ["NL", "EU"],
    ["GB", "EU"],
    ["CH", "EU"],
    ["US", "US"],
    ["CA", "US"],
    ["MA", "US"],
    ["XX", "US"],
    ["", "US"],
  ])("%s prices as %s", (country, market) => {
    expect(marketForCountry(country)).toBe(market);
  });

  it("falls back to USD when the country is unknown", () => {
    expect(marketForCountry(null)).toBe("US");
    expect(marketForCountry(undefined)).toBe("US");
  });

  it("recognises only the five markets", () => {
    for (const m of DECOR_MARKETS) expect(isDecorMarket(m)).toBe(true);
    expect(isDecorMarket("FR")).toBe(false);
    expect(isDecorMarket(3)).toBe(false);
  });
});

describe("the catalogue", () => {
  it("prices every item in every sourced market, low never above high", () => {
    expect(Object.keys(DECOR_CATALOGUE).sort()).toEqual([...DECOR_ITEM_KEYS].sort());
    for (const key of DECOR_ITEM_KEYS) {
      for (const [market, [lo, hi]] of Object.entries(DECOR_CATALOGUE[key].prices)) {
        expect(lo, `${key} ${market}`).toBeGreaterThan(0);
        expect(lo, `${key} ${market}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("carries the sourced figures, spot-checked against the research", () => {
    expect(DECOR_CATALOGUE.kosha_stage.prices.EG).toEqual([15000, 120000]);
    expect(DECOR_CATALOGUE.chair_rental.prices.EU).toEqual([2.5, 8]);
    expect(DECOR_CATALOGUE.dance_floor.prices.AE).toEqual([100, 215]);
    expect(DECOR_CATALOGUE.table_rental.prices.SA).toEqual([30, 60]);
  });
});

describe("roundMoney", () => {
  it("rounds outward to two significant figures", () => {
    expect(roundMoney(12345, "down")).toBe(12000);
    expect(roundMoney(12345, "up")).toBe(13000);
    expect(roundMoney(456789, "down")).toBe(450000);
    expect(roundMoney(456789, "up")).toBe(460000);
    expect(roundMoney(1234, "up")).toBe(1300);
  });

  it("keeps round numbers as they are, despite float noise", () => {
    expect(roundMoney(150, "down")).toBe(150);
    expect(roundMoney(150, "up")).toBe(150);
    expect(roundMoney(2.5 * 3, "down")).toBe(7);
    expect(roundMoney(0.1 * 3 * 1000, "up")).toBe(300);
  });

  it("rounds small amounts to whole units, never to zero", () => {
    expect(roundMoney(7.5, "down")).toBe(7);
    expect(roundMoney(7.5, "up")).toBe(8);
    expect(roundMoney(0.4, "up")).toBe(1);
  });

  it("returns 0 for nothing, negatives and NaN", () => {
    expect(roundMoney(0, "up")).toBe(0);
    expect(roundMoney(-5, "up")).toBe(0);
    expect(roundMoney(Number.NaN, "down")).toBe(0);
  });
});

describe("computeDecorPlan: tables and guests", () => {
  it("seats 10 per table in Egypt, plus a head table", () => {
    const p = plan({}, { guestCount: 150 });
    expect(p.tables).toBe(15);
    expect(p.guestsPerTable).toBe(10);
    expect(item(p, "table_rental")?.qty).toBe(16);
    expect(item(p, "tablecloth")?.qty).toBe(16);
    expect(item(p, "chair_rental")?.qty).toBe(150);
  });

  it("seats 8 per table in Europe", () => {
    const p = plan({}, { guestCount: 150, market: "EU" });
    expect(p.tables).toBe(19);
    expect(item(p, "table_rental")?.qty).toBe(20);
  });

  it.each([
    [1, 1],
    [2, 1],
    [10, 1],
    [11, 2],
    [99, 10],
    [10000, 1000],
  ])("%i guests need %i guest tables", (guests, tables) => {
    const p = plan({}, { guestCount: guests });
    expect(p.tables).toBe(tables);
    expect(item(p, "table_rental")?.qty).toBe(tables + 1);
  });

  it("uses every market's own seating", () => {
    for (const market of DECOR_MARKETS) {
      const p = plan({}, { guestCount: 80, market });
      expect(p.tables).toBe(Math.ceil(80 / GUESTS_PER_TABLE[market]));
    }
    expect(GUESTS_PER_TABLE.EU).toBe(8);
    expect(GUESTS_PER_TABLE.EG).toBe(10);
  });

  it("rounds a fractional guest count", () => {
    expect(plan({}, { guestCount: 149.6 }).guestCount).toBe(150);
  });
});

describe("computeDecorPlan: missing guest count", () => {
  it.each([
    ["intimate", 30],
    ["medium", 100],
    ["large", 200],
    [null, 100],
    ["enormous", 100],
  ])("falls back by size bucket %s to %i guests", (size, guests) => {
    const p = plan({}, { guestCount: null, size });
    expect(p.guestCount).toBe(guests);
    expect(p.guestCountAssumed).toBe(true);
    expect(p.assumptions[0]).toBe("guests_from_size");
    expect(item(p, "chair_rental")?.qty).toBe(guests);
  });

  it.each([0, -3, Number.NaN, undefined])("treats %s as missing", (count) => {
    const p = plan({}, { guestCount: count as number | undefined, size: "large" });
    expect(p.guestCount).toBe(200);
    expect(p.guestCountAssumed).toBe(true);
  });

  it("does not claim an assumption when the couple gave a count", () => {
    const p = plan({}, { guestCount: 120 });
    expect(p.guestCountAssumed).toBe(false);
    expect(p.assumptions).not.toContain("guests_from_size");
  });
});

describe("computeDecorPlan: area driven lines", () => {
  it("allows 1.2 m2 a guest, 1.5 with a dance floor", () => {
    expect(plan({}, { guestCount: 100 }).areaM2).toBe(120);
    expect(plan({ has_dance_floor: true }, { guestCount: 100 }).areaM2).toBe(150);
    expect(plan({}, { guestCount: 101 }).areaM2).toBe(122);
  });

  it("strings fairy lights at 0.6 m per m2 of floor, only when the render has them", () => {
    expect(item(plan({}, { guestCount: 100 }), "string_lights")).toBeUndefined();
    const p = plan({ has_string_lights: true }, { guestCount: 100 });
    expect(item(p, "string_lights")?.qty).toBe(72);
    expect(item(p, "string_lights")?.unit).toBe("m");
    expect(p.assumptions).toContain("area");
  });

  it("drapes a ceiling indoors and in a tent, never outdoors", () => {
    const draped = { has_draping: true };
    expect(item(plan(draped, { guestCount: 100 }), "ceiling_draping")?.qty).toBe(120);
    expect(
      item(plan(draped, { guestCount: 100, setting: "tent" }), "ceiling_draping")?.qty,
    ).toBe(120);
    expect(
      item(plan(draped, { guestCount: 100, setting: "outdoor" }), "ceiling_draping"),
    ).toBeUndefined();
    expect(item(plan({}, { guestCount: 100 }), "ceiling_draping")).toBeUndefined();
  });

  it.each([
    [20, 16],
    [50, 16],
    [100, 20],
    [200, 40],
    [499, 100],
    [5000, 100],
  ])("sizes the dance floor for %i guests at %i m2", (guests, m2) => {
    const p = plan({ has_dance_floor: true }, { guestCount: guests });
    expect(item(p, "dance_floor")?.qty).toBe(m2);
  });

  it("has no dance floor unless the render shows one", () => {
    expect(item(plan({}, { guestCount: 200 }), "dance_floor")).toBeUndefined();
  });

  it("prices a tent only for the tent setting, over the whole floor", () => {
    expect(item(plan({}, { setting: "indoor" }), "tent")).toBeUndefined();
    expect(item(plan({}, { setting: "outdoor" }), "tent")).toBeUndefined();
    const p = plan({}, { setting: "tent", guestCount: 150 });
    expect(item(p, "tent")?.qty).toBe(180);
    expect(item(p, "tent")?.unit).toBe("m2");
  });

  it("hangs one chandelier per 40 m2, rounded up", () => {
    expect(
      item(plan({ has_chandeliers: true }, { guestCount: 100 }), "chandelier")?.qty,
    ).toBe(3);
    expect(
      item(
        plan({ has_chandeliers: true, has_dance_floor: true }, { guestCount: 100 }),
        "chandelier",
      )?.qty,
    ).toBe(4);
  });
});

describe("computeDecorPlan: what the render shows", () => {
  it("splits centrepieces by style", () => {
    const low = plan({ centerpiece: "low" }, { guestCount: 150 });
    expect(item(low, "centerpiece_low")?.qty).toBe(16);
    expect(item(low, "centerpiece_tall")).toBeUndefined();

    const tall = plan({ centerpiece: "tall" }, { guestCount: 150 });
    expect(item(tall, "centerpiece_tall")?.qty).toBe(16);
    expect(item(tall, "centerpiece_low")).toBeUndefined();

    const mixed = plan({ centerpiece: "mixed" }, { guestCount: 150 });
    expect(item(mixed, "centerpiece_tall")?.qty).toBe(8);
    expect(item(mixed, "centerpiece_low")?.qty).toBe(8);

    const odd = plan({ centerpiece: "mixed" }, { guestCount: 140 });
    expect(item(odd, "centerpiece_tall")?.qty).toBe(8);
    expect(item(odd, "centerpiece_low")?.qty).toBe(7);

    const none = plan({ centerpiece: "none" });
    expect(item(none, "centerpiece_tall")).toBeUndefined();
    expect(item(none, "centerpiece_low")).toBeUndefined();
  });

  it("dresses tables in cloths, runners or nothing", () => {
    const cloth = plan({ linens: "floor_length" });
    expect(item(cloth, "tablecloth")?.qty).toBe(16);
    expect(item(cloth, "table_runner")).toBeUndefined();

    const runner = plan({ linens: "runner_only" });
    expect(item(runner, "table_runner")?.qty).toBe(16);
    expect(item(runner, "tablecloth")).toBeUndefined();

    const bare = plan({ linens: "bare" });
    expect(item(bare, "table_runner")).toBeUndefined();
    expect(item(bare, "tablecloth")).toBeUndefined();
  });

  it("prices candles by density, and none when there are none", () => {
    expect(item(plan({ candle_density: "none" }), "candles")).toBeUndefined();
    const some = item(plan({ candle_density: "some" }), "candles")!;
    const lots = item(plan({ candle_density: "lots" }), "candles")!;
    expect(some.qty).toBe(16);
    expect([some.unitLo, some.unitHi]).toEqual([150, 475]);
    expect([lots.unitLo, lots.unitHi]).toEqual([475, 800]);
  });

  it("drops the kosha, arch and entrance the render does not have", () => {
    const p = plan({ has_stage: false, has_arch: false, has_entrance_decor: false });
    expect(item(p, "kosha_stage")).toBeUndefined();
    expect(item(p, "ceremony_arch")).toBeUndefined();
    expect(item(p, "entrance")).toBeUndefined();
    const all = plan({ has_stage: true, has_arch: true, has_entrance_decor: true });
    expect(item(all, "kosha_stage")?.qty).toBe(1);
    expect(item(all, "ceremony_arch")?.qty).toBe(1);
    expect(item(all, "entrance")?.qty).toBe(1);
  });

  it("narrows floral lines with floral density", () => {
    const light = plan({ floral_density: "light" });
    const lush = plan({ floral_density: "lush" });
    const medium = plan({ floral_density: "medium" });
    expect([item(medium, "kosha_stage")!.unitLo, item(medium, "kosha_stage")!.unitHi]).toEqual([
      15000, 120000,
    ]);
    expect([item(light, "kosha_stage")!.unitLo, item(light, "kosha_stage")!.unitHi]).toEqual([
      15000, 67500,
    ]);
    expect([item(lush, "kosha_stage")!.unitLo, item(lush, "kosha_stage")!.unitHi]).toEqual([
      67500, 120000,
    ]);
    // Non-floral lines are untouched.
    expect(item(light, "chair_rental")!.unitHi).toBe(100);
    expect(light.assumptions).toContain("floral_light");
    expect(lush.assumptions).toContain("floral_lush");
    expect(medium.assumptions).not.toContain("floral_light");
  });

  it("uses the lower half of the lighting rig for a small room", () => {
    expect(item(plan({}, { guestCount: 149 }), "lighting_rig")!.unitHi).toBe(18000);
    expect(item(plan({}, { guestCount: 150 }), "lighting_rig")!.unitHi).toBe(30000);
  });

  it("adds a third sign past 15 tables", () => {
    expect(item(plan({}, { guestCount: 150 }), "signage")?.qty).toBe(2);
    expect(item(plan({}, { guestCount: 151 }), "signage")?.qty).toBe(3);
  });

  it("tags chairs, tables and centrepieces with what the render shows", () => {
    const p = plan({ chair_style: "ghost", table_shape: "long", flowers: ["rose", "other"] });
    expect(item(p, "chair_rental")?.details).toEqual([{ kind: "chair", value: "ghost" }]);
    expect(item(p, "table_rental")?.details).toEqual([{ kind: "table", value: "long" }]);
    expect(item(p, "centerpiece_low")?.details).toEqual([{ kind: "flower", value: "rose" }]);
    expect(item(plan({ chair_style: "other" }), "chair_rental")?.details).toEqual([]);
  });

  it("never lists a zero-quantity line", () => {
    const p = plan({}, { guestCount: 1 });
    for (const i of p.items) expect(i.qty).toBeGreaterThan(0);
  });
});

describe("computeDecorPlan: money", () => {
  it("quotes each market in its own currency", () => {
    for (const market of DECOR_MARKETS) {
      expect(plan({}, { market }).currency).toBe(MARKET_CURRENCY[market]);
    }
    expect(MARKET_CURRENCY).toEqual({
      EG: "EGP",
      AE: "AED",
      SA: "SAR",
      EU: "EUR",
      US: "USD",
    });
  });

  it("derives USD from European prices plus 10%, and says so", () => {
    const us = plan({}, { market: "US" });
    const chairs = item(us, "chair_rental")!;
    expect(chairs.unitLo).toBeCloseTo(2.75);
    expect(chairs.unitHi).toBeCloseTo(8.8);
    expect(us.assumptions).toContain("us_estimate");
    expect(plan({}, { market: "EU" }).assumptions).not.toContain("us_estimate");
  });

  it("every line range contains its exact product, and totals add up", () => {
    const heavy: Partial<DecorAnalysis> = {
      centerpiece: "mixed",
      has_arch: true,
      has_dance_floor: true,
      has_draping: true,
      has_chandeliers: true,
      has_string_lights: true,
      candle_density: "lots",
      floral_density: "lush",
    };
    for (const market of DECOR_MARKETS as readonly DecorMarket[]) {
      for (const guestCount of [2, 37, 150, 333, 1200]) {
        const p = plan(heavy, { market, guestCount, setting: "tent" });
        let lo = 0;
        let hi = 0;
        for (const i of p.items) {
          expect(i.lo).toBeLessThanOrEqual(i.qty * i.unitLo + 1e-6);
          expect(i.hi).toBeGreaterThanOrEqual(i.qty * i.unitHi - 1e-6);
          expect(i.lo).toBeLessThanOrEqual(i.hi);
          lo += i.lo;
          hi += i.hi;
        }
        expect(p.totals.lo).toBeLessThanOrEqual(lo);
        expect(p.totals.hi).toBeGreaterThanOrEqual(hi);
        expect(p.totals.lo).toBeGreaterThan(0);
      }
    }
  });

  it("prices a typical Egyptian hall for 150 in a believable band", () => {
    // A kosha, entrance, low centrepieces, cloths, chairs, tables, a rig and
    // signs, the most common render. Anchored so a units slip (per m2 read
    // as per event, say) shows up as a failing number, not a quiet lie.
    // The research put total decor for an Egyptian wedding at 30k to 500k.
    const p = plan();
    expect(p.totals.lo).toBe(43000);
    expect(p.totals.hi).toBe(290000);
  });

  it("states the market's own caveats", () => {
    const eg = plan({}, { market: "EG" });
    expect(eg.assumptions).toEqual(
      expect.arrayContaining(["tables", "venue_package", "eg_estimates", "season_eg", "not_included"]),
    );
    expect(plan({}, { market: "EU" }).assumptions).toContain("season_eu");
    expect(plan({}, { market: "AE" }).assumptions).not.toContain("eg_estimates");
  });
});

describe("stored analysis", () => {
  const stored = { ...BASE, locale: "ar", analyzedAt: "2026-09-22T10:00:00.000Z" };

  it("reads the analysis back from meta.decor, keeping other keys on write", () => {
    const meta = withStoredDecor({ mode: "refine", model: "m", costUsd: 0.02 }, stored);
    expect(meta.mode).toBe("refine");
    expect(meta.costUsd).toBe(0.02);
    expect(readStoredDecor(meta)).toMatchObject({ table_shape: "round", locale: "ar" });
  });

  it("stores decor on a legacy render without guessing its mode", () => {
    const meta = withStoredDecor(null, stored);
    expect(meta).not.toHaveProperty("mode");
    expect(readStoredDecor(meta)?.locale).toBe("ar");
  });

  it("returns null for missing or untrustworthy analyses", () => {
    expect(readStoredDecor(null)).toBeNull();
    expect(readStoredDecor([stored])).toBeNull();
    expect(readStoredDecor({ decor: { ...stored, table_shape: "hexagonal" } })).toBeNull();
    expect(readStoredDecor({ decor: { ...stored, locale: undefined } })).toBeNull();
  });

  it("deduplicates flowers on read", () => {
    const meta = withStoredDecor({}, { ...stored, flowers: ["rose", "rose", "peony"] });
    expect(readStoredDecor(meta)?.flowers).toEqual(["rose", "peony"]);
  });
});
