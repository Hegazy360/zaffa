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
    expect(g.bands.map((b) => b.fee)).toEqual([45_000, 65_000, 100_000]);
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
