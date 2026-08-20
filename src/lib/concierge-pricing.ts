/**
 * Quoting policy for the full-service plan ("The Whole Wedding").
 *
 * This encodes `docs/pricing-full-service.md` so the numbers live in one place
 * instead of in an operator's head. It feeds three surfaces that must never
 * disagree: the quote panel in the enquiry CRM, the budget chips in the intake
 * wizard, and - as of ZAF-48 - the public `/pricing` table.
 *
 * That last one is a reversal. This module used to say the model was never
 * exposed publicly, on the reasoning that no single price fits Cairo and Dubai
 * alike. The reasoning was sound and the conclusion was wrong: the answer to
 * "one price cannot fit both markets" is a published fee *per market*, not
 * silence. See `docs/pricing-published-2026-08.md`.
 *
 * The model, in one line: from a single per-market input `E` (the event budget
 * at which full service becomes a realistic purchase), derive three geometric
 * bands. Every fee is exactly 15% at the bottom of its band and 10% at the
 * top, so the whole ladder sits inside the verified 10-15% planner-fee norm by
 * construction, in any market, without anyone doing arithmetic.
 */

/** Currency for a market. Mirrors the choices already made in `SEED_AUTHORED`
 *  (vision-pack-pricing.ts) so a visitor never sees two different currencies
 *  for the same country across the packs and the concierge plan. */
export const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  EG: "EGP",
  SA: "SAR",
  AE: "AED",
  QA: "QAR",
  KW: "USD", // 3-decimal Gulf currencies route to USD, as the packs do
  BH: "USD",
  OM: "USD",
  JO: "USD",
  LB: "USD",
  MA: "USD",
  GB: "GBP",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  DE: "EUR",
  NL: "EUR",
  BE: "EUR",
  US: "USD",
  CA: "USD",
};

export const DEFAULT_CURRENCY = "USD";

export function currencyForCountry(country: string | null | undefined): string {
  if (!country) return DEFAULT_CURRENCY;
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? DEFAULT_CURRENCY;
}

export interface QuoteBand {
  /** Event budget this band covers, inclusive lower bound. */
  budgetFrom: number;
  /** Exclusive upper bound. */
  budgetTo: number;
  /** Our fee for a wedding in this band. */
  fee: number;
}

export interface MarketGuidance {
  country: string;
  currency: string;
  /** Entry budget the bands derive from. */
  entryBudget: number;
  bands: QuoteBand[];
  /** Published ceiling - above this we quote bespoke, but the buyer knows a
   *  ceiling exists, which is what makes "it depends" tolerable. */
  cap: number;
}

/**
 * Markets we have researched well enough to quote from a table. `E` is set
 * from that market's realistic mid-to-upscale event budget.
 *
 * Everything else is deliberately absent rather than guessed, an unlisted
 * country gets a bespoke quote, never a wrong number. The founder's rule is
 * that we never turn a client away by country, not that we pretend to know
 * every market's pricing.
 */
const MARKETS: Readonly<Record<string, { currency: string; entryBudget: number; cap: number }>> = {
  EG: { currency: "EGP", entryBudget: 300_000, cap: 200_000 },
  AE: { currency: "AED", entryBudget: 200_000, cap: 200_000 },
};

/**
 * Published band figures, rounded to legible numbers.
 *
 * These are authored rather than computed so the code can never drift *above*
 * the documented table: rounding is always in the couple's favour, which pulls
 * bands 2 and 3 slightly under the strict 0.225E / 0.3375E. `deriveBands`
 * exists for markets we add later and is unit-tested against these.
 */
const PUBLISHED_FEES: Readonly<Record<string, [number, number, number]>> = {
  // Egypt band 3 was 100_000 until 2026-08-20. Publishing the table meant
  // publishing band *edges*, and at the resulting band-3 floor of 650_000 a
  // fee of 100_000 is 15.4%, outside the norm this model exists to stay
  // inside. 95_000 is 14.6% there and exactly 10% at 950_000.
  EG: [45_000, 65_000, 95_000],
  AE: [30_000, 45_000, 65_000],
};

/**
 * Published band edges: `[floor, ceiling]` per band, in market currency.
 *
 * The derived model steps budgets at 1.5× (E, 1.5E, 2.25E, 3.375E), which
 * produces edges like EGP 1,012,500 - a fine internal boundary and an
 * unpublishable one. These are the legible equivalents, derived as
 * `fee / 0.15` to `fee / 0.10`, with each band starting exactly where the
 * previous ends so the table has no gaps for a reader to fall into.
 *
 * Every entry is checked in `tests/concierge-pricing.test.ts` against the
 * property that makes the whole ladder safe: fee ≤ 15% at the floor and
 * ≥ 10% at the ceiling. Editing a number here without editing its band edge
 * fails that test rather than quietly shipping a rate outside the norm.
 */
const PUBLISHED_EDGES: Readonly<
  Record<string, [[number, number], [number, number], [number, number]]>
> = {
  EG: [
    [300_000, 450_000],
    [450_000, 650_000],
    [650_000, 950_000],
  ],
  AE: [
    [200_000, 300_000],
    [300_000, 450_000],
    [450_000, 650_000],
  ],
};

/**
 * The pure model: three bands at 1.5× budget steps, priced so each is 15% at
 * its floor and 10% at its ceiling. Used for markets without an authored
 * table, and as the property that the authored numbers are checked against.
 */
export function deriveBands(entryBudget: number): QuoteBand[] {
  const E = entryBudget;
  return [
    { budgetFrom: E, budgetTo: 1.5 * E, fee: 0.15 * E },
    { budgetFrom: 1.5 * E, budgetTo: 2.25 * E, fee: 0.225 * E },
    { budgetFrom: 2.25 * E, budgetTo: 3.375 * E, fee: 0.3375 * E },
  ];
}

/**
 * Quote guidance for a market, or `null` when we have no table for it.
 *
 * A `null` here is not a refusal, it means "quote this one bespoke". The
 * caller (the admin quote panel) renders that state explicitly.
 */
export function quoteGuidanceFor(
  country: string | null | undefined,
): MarketGuidance | null {
  if (!country) return null;
  const code = country.toUpperCase();
  const market = MARKETS[code];
  if (!market) return null;

  const derived = deriveBands(market.entryBudget);
  const fees = PUBLISHED_FEES[code];
  const edges = PUBLISHED_EDGES[code];
  const bands = fees
    ? derived.map((b, i) => ({
        budgetFrom: edges?.[i]?.[0] ?? b.budgetFrom,
        budgetTo: edges?.[i]?.[1] ?? b.budgetTo,
        fee: fees[i],
      }))
    : derived;

  return {
    country: code,
    currency: market.currency,
    entryBudget: market.entryBudget,
    bands,
    cap: market.cap,
  };
}

/** Every market we can quote from a table, for admin UI affordances. */
export function pricedMarkets(): string[] {
  return Object.keys(MARKETS);
}

/**
 * Budget bands offered in the intake wizard, as opaque string ids plus their
 * numeric range. Stored on the enquiry so the operator sees what the couple
 * self-selected before the call.
 *
 * Derived from the same `E` so the wizard and the quote panel never disagree
 * about what "medium" means in a given market. Unpriced markets fall back to a
 * USD ladder - deliberately coarse, because its only job is to tell the
 * operator roughly where the conversation starts.
 */
export interface BudgetBandOption {
  id: string;
  from: number;
  to: number | null;
  currency: string;
}

const DEFAULT_LADDER: Array<[number, number | null]> = [
  [25_000, 50_000],
  [50_000, 100_000],
  [100_000, 250_000],
  [250_000, null],
];

export function budgetBandsFor(country: string | null | undefined): BudgetBandOption[] {
  const guidance = quoteGuidanceFor(country);
  if (guidance) {
    const { bands, currency } = guidance;
    return [
      { id: "below", from: 0, to: bands[0].budgetFrom, currency },
      ...bands.map((b, i) => ({
        id: `band${i + 1}`,
        from: b.budgetFrom,
        to: b.budgetTo,
        currency,
      })),
      { id: "above", from: bands[bands.length - 1].budgetTo, to: null, currency },
    ];
  }
  const currency = currencyForCountry(country);
  return DEFAULT_LADDER.map(([from, to], i) => ({
    id: `default${i + 1}`,
    from,
    to,
    currency,
  }));
}
