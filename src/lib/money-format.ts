/**
 * Money formatting, with Arabic pinned to Latin digits.
 *
 * Decision D11: every money surface renders Latin numerals in Arabic, while
 * Eastern Arabic numerals stay everywhere else. The reason is comparison —
 * these figures sit next to Stripe receipts, bank statements and vendor
 * invoices, none of which will ever render ٤٥٬٠٠٠, and a reader checking one
 * against the other should not have to transliterate. The currency symbol
 * still localises (`د.إ.`), so the result reads as Arabic; only the digits
 * are pinned.
 *
 * This lives in one module because a rule that has to be remembered at four
 * call sites is not a rule. Wrap the output in `<bdi>` wherever it sits
 * inside RTL prose, so the bidi algorithm cannot drag a neighbouring
 * character into the number.
 */

/** The BCP-47 tag to format money with, for a UI locale. */
export function moneyLocaleTag(locale: string): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : locale;
}

/**
 * Currency-formatted amount in major units.
 *
 * Falls back to `CODE 45,000` if the runtime rejects the currency — an
 * unknown ISO code should degrade to a legible number, never throw inside a
 * render.
 */
export function formatMoney(
  amount: number,
  currency: string,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  try {
    return new Intl.NumberFormat(moneyLocaleTag(locale), {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      ...options,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

/** Dates on money surfaces follow the same digit rule as the amounts. */
export function formatMoneyDate(
  date: string | Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
): string {
  return new Intl.DateTimeFormat(moneyLocaleTag(locale), options).format(
    new Date(date),
  );
}

/**
 * The other half of D11.
 *
 * Money is pinned to Latin digits in Arabic; everything else keeps the
 * Eastern Arabic numerals the rest of the Arabic copy is written in. That
 * second half is easy to get wrong by accident, because CLDR's numbering
 * system for the bare `ar` locale is *latn* — `Intl.NumberFormat("ar")`
 * returns "1", not "١". A step badge formatted with the raw UI locale
 * therefore renders Latin digits next to prose containing ١١٫٨٪, which reads
 * as a bug rather than a decision.
 *
 * `ar-EG` is the tag that actually carries `arab` numerals, and Egypt is the
 * dialect base of the Arabic copy anyway.
 */
export function uiLocaleTag(locale: string): string {
  return locale === "ar" ? "ar-EG" : locale;
}

/** Counts, positions, step numbers — anything numeric that is not money. */
export function formatCount(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(uiLocaleTag(locale), options).format(value);
}
