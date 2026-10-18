import { describe, expect, it } from "vitest";
import {
  budgetBandsFor,
  currencyForCountry,
  deriveBands,
  quoteGuidanceFor,
} from "@/lib/concierge-pricing";

describe("deriveBands", () => {
  it("puts every fee at exactly 15% of its band floor and 10% of its ceiling", () => {
    // This is the whole point of the model: the ladder cannot drift outside
    // the verified 10-15% planner-fee norm, in any market, by construction.
    for (const E of [100_000, 200_000, 300_000, 1_000_000]) {
      for (const band of deriveBands(E)) {
        expect(band.fee / band.budgetFrom).toBeCloseTo(0.15, 10);
        expect(band.fee / band.budgetTo).toBeCloseTo(0.1, 10);
      }
    }
  });

  it("steps budgets geometrically at 1.5x with no gaps between bands", () => {
    const bands = deriveBands(200_000);
    expect(bands[0].budgetTo).toBe(bands[1].budgetFrom);
    expect(bands[1].budgetTo).toBe(bands[2].budgetFrom);
    expect(bands[1].budgetFrom / bands[0].budgetFrom).toBeCloseTo(1.5, 10);
  });
});

describe("quoteGuidanceFor", () => {
  it("reproduces the published UAE table", () => {
    const g = quoteGuidanceFor("AE")!;
    expect(g.currency).toBe("AED");
    expect(g.bands.map((b) => b.fee)).toEqual([30_000, 45_000, 65_000]);
    expect(g.cap).toBe(200_000);
  });

  it("reproduces the published Egypt table", () => {
    const g = quoteGuidanceFor("EG")!;
    expect(g.currency).toBe("EGP");
    // Band 3 was 100_000 until publishing the table forced its edges to be
    // stated. At the resulting floor of 650_000 that is 15.4%, outside the
    // norm. See the internal published-pricing notes.
    expect(g.bands.map((b) => b.fee)).toEqual([45_000, 65_000, 95_000]);
  });

  it("publishes band edges the table can actually show", () => {
    // The derived model steps at 1.5x, which produces edges like 1_012_500.
    // Fine internally, unpublishable on a page. These are the legible ones.
    expect(quoteGuidanceFor("AE")!.bands.map((b) => [b.budgetFrom, b.budgetTo])).toEqual([
      [200_000, 300_000],
      [300_000, 450_000],
      [450_000, 650_000],
    ]);
    expect(quoteGuidanceFor("EG")!.bands.map((b) => [b.budgetFrom, b.budgetTo])).toEqual([
      [300_000, 450_000],
      [450_000, 650_000],
      [650_000, 950_000],
    ]);
  });

  it("keeps every published band inside the 10-15% norm at both of its edges", () => {
    // The load-bearing test for the whole published table. Rounding a fee to a
    // legible number, or nudging a band edge, can silently push a rate outside
    // the range the entire pricing argument rests on. This is what catches it.
    for (const country of ["EG", "AE"]) {
      for (const band of quoteGuidanceFor(country)!.bands) {
        const atFloor = band.fee / band.budgetFrom;
        const atCeiling = band.fee / band.budgetTo;
        expect(atFloor).toBeLessThanOrEqual(0.15 + 1e-9);
        expect(atCeiling).toBeGreaterThanOrEqual(0.1 - 1e-9);
        // And the rate must fall across the band, never rise.
        expect(atCeiling).toBeLessThan(atFloor);
      }
    }
  });

  it("leaves no gap between published bands", () => {
    // A gap is a budget with no published price, which on a public table
    // reads as either a mistake or a trap.
    for (const country of ["EG", "AE"]) {
      const bands = quoteGuidanceFor(country)!.bands;
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].budgetFrom).toBe(bands[i - 1].budgetTo);
      }
    }
  });

  it("caps the bespoke quote below the top band's ceiling being unbounded", () => {
    // "Quoted for your day" is only tolerable next to a published ceiling.
    for (const country of ["EG", "AE"]) {
      const g = quoteGuidanceFor(country)!;
      expect(g.cap).toBeGreaterThan(g.bands.at(-1)!.fee);
    }
  });

  it("never publishes a fee above 15% of its band floor", () => {
    // Rounding the derived figures to legible numbers must always land in the
    // couple's favour. A published fee above the derived one would put us
    // outside the market norm we anchor on.
    for (const country of ["EG", "AE"]) {
      const g = quoteGuidanceFor(country)!;
      const derived = deriveBands(g.entryBudget);
      g.bands.forEach((band, i) => {
        expect(band.fee).toBeLessThanOrEqual(derived[i].fee);
        expect(band.fee / band.budgetFrom).toBeLessThanOrEqual(0.15 + 1e-9);
      });
    }
  });

  it("is case-insensitive on the country code", () => {
    expect(quoteGuidanceFor("ae")?.currency).toBe("AED");
  });

  it("returns null for an unpriced market rather than guessing", () => {
    // A null means "quote bespoke", never "refuse". The founder's rule is that
    // we never turn a client away by country.
    expect(quoteGuidanceFor("NG")).toBeNull();
    expect(quoteGuidanceFor("FR")).toBeNull();
    expect(quoteGuidanceFor(null)).toBeNull();
  });
});

describe("currencyForCountry", () => {
  it("matches the pack pricing choices for known markets", () => {
    expect(currencyForCountry("EG")).toBe("EGP");
    expect(currencyForCountry("AE")).toBe("AED");
    expect(currencyForCountry("FR")).toBe("EUR");
    expect(currencyForCountry("GB")).toBe("GBP");
  });

  it("routes 3-decimal Gulf currencies to USD, as the packs do", () => {
    expect(currencyForCountry("KW")).toBe("USD");
    expect(currencyForCountry("BH")).toBe("USD");
  });

  it("falls back to USD for anywhere unlisted", () => {
    expect(currencyForCountry("NG")).toBe("USD");
    expect(currencyForCountry(undefined)).toBe("USD");
  });
});

describe("budgetBandsFor", () => {
  it("brackets the priced bands with a below and an above option", () => {
    const bands = budgetBandsFor("AE");
    expect(bands[0].id).toBe("below");
    expect(bands.at(-1)!.id).toBe("above");
    expect(bands.at(-1)!.to).toBeNull();
    expect(bands.every((b) => b.currency === "AED")).toBe(true);
  });

  it("gives an unpriced market a coarse USD ladder", () => {
    const bands = budgetBandsFor("NG");
    expect(bands.every((b) => b.currency === "USD")).toBe(true);
    expect(bands.length).toBeGreaterThan(0);
  });

  it("produces contiguous ranges with no gap or overlap", () => {
    for (const country of ["AE", "EG", "NG"]) {
      const bands = budgetBandsFor(country);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].from).toBe(bands[i - 1].to);
      }
    }
  });
});
