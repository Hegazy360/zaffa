// Single source of truth for the platform's locales. Anywhere we need to
// fall back, validate, or iterate locales we go through this module.

export const locales = ["en", "ar"] as const;
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

// Cookie name + canonical max-age. One year keeps the choice sticky without
// being permanent.
export const LOCALE_COOKIE = "zaffa_locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Human labels, used by the navbar locale switcher. Rendered in their own
// language so the user always sees a familiar label.
export const localeLabels: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};
