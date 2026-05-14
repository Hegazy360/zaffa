// Locale-aware formatters used across the platform. The whole codebase
// previously hard-coded `new Intl.NumberFormat("en-EG", ...)` and
// `date-fns` `format(date, "PP")`, which produced English-only output in
// Arabic locale. These helpers route everything through `Intl` with an
// explicit locale, so the navbar's locale switcher actually changes how
// money and dates render.

import type { Locale } from "@/i18n/config";

// Map our app locales to BCP-47 tags. We bias to Egyptian Arabic since the
// product is Egypt-first; widening to other Arabic regions later just means
// adding rows here without touching call-sites.
const LOCALE_TAG: Record<Locale, string> = {
  en: "en-EG",
  ar: "ar-EG",
  fr: "fr-FR",
  de: "de-DE",
};

function tagFor(locale: string | Locale | undefined): string {
  if (!locale) return LOCALE_TAG.en;
  if (locale in LOCALE_TAG) return LOCALE_TAG[locale as Locale];
  return locale;
}

/**
 * Format a money amount in a given currency. `locale` defaults to English so
 * legacy callers (`formatCurrency(123)`) keep working unchanged.
 */
export function formatCurrency(
  amount: number,
  currency: string = "EGP",
  locale: string | Locale = "en",
): string {
  try {
    return new Intl.NumberFormat(tagFor(locale), {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// Preset date styles that map roughly to the date-fns tokens we used to
// pass ("PP" -> medium, "PPP" -> long, "p" -> short time, "Pp" ->
// medium+time). Keeping the surface narrow makes call-sites uniform.
export type DateStyle = "short" | "medium" | "long" | "datetime" | "time";

export function formatDate(
  input: Date | string | number,
  style: DateStyle = "medium",
  locale: string | Locale = "en",
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const tag = tagFor(locale);
  const opts: Intl.DateTimeFormatOptions = (() => {
    switch (style) {
      case "short":
        return { dateStyle: "short" };
      case "long":
        return { dateStyle: "long" };
      case "datetime":
        return { dateStyle: "medium", timeStyle: "short" };
      case "time":
        return { timeStyle: "short" };
      case "medium":
      default:
        return { dateStyle: "medium" };
    }
  })();
  try {
    return new Intl.DateTimeFormat(tag, opts).format(date);
  } catch {
    return date.toDateString();
  }
}

export function formatNumber(value: number, locale: string | Locale = "en"): string {
  try {
    return new Intl.NumberFormat(tagFor(locale)).format(value);
  } catch {
    return String(value);
  }
}

// Relative-time formatter used for "3 days ago" / "in 5 hours" style
// timestamps. Falls back to a coarse English string if Intl isn't
// available (older runtimes).
export function formatRelativeTime(
  input: Date | string | number,
  locale: string | Locale = "en",
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const tag = tagFor(locale);
  const diffMs = date.getTime() - Date.now();
  const absSec = Math.abs(diffMs / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  const [unit, secs] = units.find(([, s]) => absSec >= s) ?? ["second", 1];
  const value = Math.round(diffMs / 1000 / secs);
  try {
    return new Intl.RelativeTimeFormat(tag, { numeric: "auto" }).format(
      value,
      unit,
    );
  } catch {
    return `${value} ${unit}${Math.abs(value) === 1 ? "" : "s"} ${diffMs < 0 ? "ago" : ""}`.trim();
  }
}
