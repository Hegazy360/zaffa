import { defaultLocale } from "@/i18n/config";

/**
 * ISO 3166-1 alpha-2 codes for every country we will let someone pick.
 *
 * Derived from what `Intl.DisplayNames` can actually name, minus three
 * groups that would make the picker look unmaintained or absurd:
 * deprecated ISO 3166-3 codes (the Soviet Union, East Germany, Zaire),
 * pseudo-regions (EU, and UK, since the ISO code for Britain is GB), and
 * uninhabited territories (Antarctica, Bouvet Island).
 *
 * Names are NOT stored here. `Intl.DisplayNames` already knows every
 * country in every locale the app ships, so shipping four translated name
 * tables would be ~40 KB of duplicated CLDR data that can drift.
 */
export const COUNTRY_CODES: readonly string[] = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AS", "AT", "AU",
  "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ",
  "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BW", "BY", "BZ", "CA",
  "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CQ",
  "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO",
  "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM",
  "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM",
  "GN", "GP", "GQ", "GR", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT",
  "HU", "ID", "IE", "IL", "IM", "IN", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY",
  "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO",
  "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT",
  "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD",
  "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TG", "TH", "TJ", "TK", "TL",
  "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US", "UY",
  "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE",
  "YT", "ZA", "ZM", "ZW",
];

/**
 * The flag as an emoji, built from the country code itself: each letter
 * maps to its regional indicator symbol, and the pair renders as a flag.
 * No image requests, no sprite sheet, no dependency.
 *
 * Windows renders these as the two letters instead of a flag, which is a
 * graceful degradation rather than a bug: the code is still readable.
 */
export function countryFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** Localized country name, falling back to the raw code if a runtime does
 *  not know it. Never throws, because this renders inside a form. */
export function countryName(code: string, locale: string = defaultLocale): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * What people actually type, which is often not the country's official
 * name: abbreviations ("UAE", "KSA", "UK"), the city they are getting
 * married in, or the local-language name. Official names alone strand a
 * search for "UAE", because it is not a substring of "United Arab
 * Emirates", which is exactly how someone in Dubai would look for it.
 *
 * Weighted toward the launch markets rather than exhaustive; anything not
 * listed still matches on its name in any of the shipped locales.
 */
const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  AE: ["uae", "u.a.e", "emirates", "dubai", "abu dhabi", "sharjah", "الامارات", "دبي", "ابوظبي"],
  SA: ["ksa", "saudi", "riyadh", "jeddah", "السعودية", "الرياض", "جدة"],
  EG: ["masr", "cairo", "alexandria", "مصر", "القاهرة", "الاسكندرية"],
  QA: ["doha", "قطر", "الدوحة"],
  KW: ["الكويت"],
  BH: ["manama", "البحرين"],
  OM: ["muscat", "عمان", "مسقط"],
  JO: ["amman", "الاردن"],
  LB: ["beirut", "لبنان", "بيروت"],
  GB: ["uk", "u.k", "britain", "great britain", "england", "scotland", "wales", "london"],
  US: ["usa", "u.s", "u.s.a", "america", "united states of america"],
  FR: ["paris", "france", "فرنسا", "باريس"],
  IT: ["rome", "roma", "milan"],
  ES: ["madrid", "barcelona"],
  TR: ["turkiye", "türkiye", "istanbul", "تركيا", "اسطنبول"],
  MA: ["marrakech", "casablanca", "المغرب", "مراكش"],
  GR: ["athens", "santorini", "mykonos"],
  IN: ["mumbai", "delhi", "bombay"],
  NL: ["holland", "amsterdam"],
  CZ: ["czechia", "prague"],
  CH: ["swiss", "geneva", "zurich"],
  DE: ["deutschland", "berlin", "munich"],
};

export interface CountryOption {
  code: string;
  name: string;
  /** The English name, kept so an Arabic or French speaker can still find
   *  "United Arab Emirates" by typing it the way they saw it on a form. */
  englishName: string;
  flag: string;
  /** Lowercased alternates: abbreviations, major cities, local spellings. */
  aliases: readonly string[];
}

/** True when `query` plausibly refers to this country: its name in the
 *  reader's locale, its English name, its ISO code, or a known alias. */
export function countryMatches(option: CountryOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    option.name.toLowerCase().includes(q) ||
    option.englishName.toLowerCase().includes(q) ||
    option.code.toLowerCase() === q ||
    option.aliases.some((a) => a.includes(q))
  );
}

/**
 * Every country, named in `locale` and sorted the way that locale sorts.
 * `Intl.Collator`, not `Array.sort`, so Arabic and French orderings are
 * right rather than byte order.
 */
export function countryOptions(locale: string = defaultLocale): CountryOption[] {
  const collator = new Intl.Collator(locale);
  return COUNTRY_CODES.map((code) => ({
    code,
    name: countryName(code, locale),
    englishName: countryName(code, "en"),
    flag: countryFlag(code),
    aliases: COUNTRY_ALIASES[code] ?? [],
  })).sort((a, b) => collator.compare(a.name, b.name));
}
