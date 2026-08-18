// Single source of truth for the platform's locales. Anywhere we need to
// fall back, validate, or iterate locales we go through this module.

export const locales = ["en", "ar", "fr", "de"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

// Locales that need `<html dir="rtl">`. We store this here (not in a stray
// helper) so adding e.g. Hebrew later is one entry.
export const rtlLocales: ReadonlySet<Locale> = new Set(["ar"]);

export function isRtlLocale(locale: string): boolean {
  return rtlLocales.has(locale as Locale);
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

// Open Graph wants an underscored locale ("ar_AR"), not a BCP-47 tag ("ar").
// Lives here next to `locales` so adding a language is one file, not two.
const ogLocales: Record<Locale, string> = {
  en: "en_US",
  ar: "ar_AR",
  fr: "fr_FR",
  de: "de_DE",
};

/** OG locale for a language tag, falling back to the default locale's. */
export function ogLocale(locale: string): string {
  return isLocale(locale) ? ogLocales[locale] : ogLocales[defaultLocale];
}

/** Every other OG locale — for `openGraph.alternateLocale`. */
export function alternateOgLocales(locale: string): string[] {
  const current = ogLocale(locale);
  return Object.values(ogLocales).filter((l) => l !== current);
}

/**
 * Shared `openGraph` locale fields.
 *
 * NOTE: Next.js **replaces** `openGraph` wholesale when a page defines its
 * own — it does not deep-merge with the layout's. So any page that sets
 * `openGraph` must spread this in itself, or its share cards silently lose
 * the locale tag. That is exactly how `og:locale` went missing from the home
 * page while the root layout looked correct.
 */
export function openGraphLocaleFields(locale: string) {
  return {
    locale: ogLocale(locale),
    alternateLocale: alternateOgLocales(locale),
  };
}

// Cookie name + canonical max-age. One year keeps the choice sticky without
// being permanent.
export const LOCALE_COOKIE = "zaffa_locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Human labels, used by the navbar locale switcher. Rendered in their own
// language so the user always sees a familiar label.
export const localeLabels: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  de: "Deutsch",
};

// ISO-3166-1 alpha-2 country → preferred Locale. Used by the middleware
// to pick an initial language when a visitor hits the site without a
// `zaffa_locale` cookie. The country signal is preferred over the
// browser's Accept-Language because it matches user intuition ("I'm in
// France, the site should be in French") and is the explicit ask in
// the product spec.
//
// Only countries with a non-default mapping are listed; anything missing
// falls through to `defaultLocale`. The user can always override via
// the navbar switcher — that path writes the cookie, which is then
// preserved on every subsequent request.
//
// Maghreb countries (DZ, MA, TN, LY) have both Arabic and French as
// widely-spoken languages but Arabic is the official language; routing
// them to `ar` matches the product's Arab-world positioning.
export const COUNTRY_TO_LOCALE: Readonly<Record<string, Locale>> = {
  // Arabic-speaking countries (Arab League + Arabic-official states)
  AE: "ar",
  BH: "ar",
  DJ: "ar",
  DZ: "ar",
  EG: "ar",
  EH: "ar",
  IQ: "ar",
  JO: "ar",
  KM: "ar",
  KW: "ar",
  LB: "ar",
  LY: "ar",
  MA: "ar",
  MR: "ar",
  OM: "ar",
  PS: "ar",
  QA: "ar",
  SA: "ar",
  SD: "ar",
  SO: "ar",
  SY: "ar",
  TN: "ar",
  YE: "ar",
  // French-speaking countries + French overseas territories. We
  // include BE and LU here because Dutch and Luxembourgish aren't
  // shipped — French is the best of the supported options for those
  // visitors. Switzerland (CH) is mapped to German below (the majority
  // language, ~62%) rather than French.
  FR: "fr",
  MC: "fr",
  LU: "fr",
  BE: "fr",
  BF: "fr",
  BI: "fr",
  BJ: "fr",
  CD: "fr",
  CF: "fr",
  CG: "fr",
  CI: "fr",
  CM: "fr",
  GA: "fr",
  GN: "fr",
  HT: "fr",
  MG: "fr",
  ML: "fr",
  MU: "fr",
  NE: "fr",
  RW: "fr",
  SC: "fr",
  SN: "fr",
  TD: "fr",
  TG: "fr",
  VU: "fr",
  GP: "fr",
  GF: "fr",
  MQ: "fr",
  YT: "fr",
  RE: "fr",
  NC: "fr",
  PF: "fr",
  PM: "fr",
  MF: "fr",
  BL: "fr",
  WF: "fr",
  // German-speaking countries.
  DE: "de",
  AT: "de",
  CH: "de",
  LI: "de",
};

/**
 * Resolve the preferred locale for a given ISO-3166-1 alpha-2 country
 * code, or `null` if the country isn't mapped (caller falls back to
 * Accept-Language / default). Case-insensitive.
 */
export function localeForCountry(
  countryCode: string | null | undefined,
): Locale | null {
  if (!countryCode) return null;
  return COUNTRY_TO_LOCALE[countryCode.toUpperCase()] ?? null;
}
