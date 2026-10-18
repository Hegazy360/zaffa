// The optional contact details a couple can leave when they approve a design
// (F5, "Leads that never rot", the design partner plan).
//
// The first real approval sat at `new` for 16 days: a Google sign-in has no
// phone, the lead had no country or date, and the only way back to the couple
// was an email they may never read. Approval now asks, optionally, for a
// WhatsApp number, the wedding month and where it is. Everything here is
// shared by the dialog (to validate before sending) and the router (to
// validate for real), so the two can never disagree about what is accepted.
//
// Importable from client and server: zod only, no Node or Prisma deps.

import { z } from "zod";

/**
 * Separators people type or paste inside a phone number: spaces (\s covers
 * the no-break space), brackets, dots, dashes, and the invisible direction
 * marks a number copied from an Arabic WhatsApp or contacts screen carries.
 */
const PHONE_SEPARATORS = /[\s().\-\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Arabic-Indic (٠ to ٩) and Persian (۰ to ۹) digits as Latin ones. An Arabic
 * phone keyboard types the former, and a number typed that way is the same
 * number: it must be accepted, and stored the way wa.me reads it.
 */
export function latinDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (c) =>
    String(c.charCodeAt(0) - (c >= "\u06F0" ? 0x06f0 : 0x0660)),
  );
}

function compactPhone(raw: string): string {
  return latinDigits(raw.trim()).replace(PHONE_SEPARATORS, "");
}

/**
 * How to write a local number from the countries our couples call from in
 * international form: the country code, the trunk prefix a local number
 * starts with and the international form drops (`0` in Egypt, `1` in North
 * America, none in the small Gulf states, and none in Italy, where the 0 of
 * a landline stays), and how many digits the number has without either.
 * A country not listed here gets no guess: the couple is asked for the code.
 */
const DIALLING_PLANS: Readonly<
  Record<string, { code: string; trunk: string; digits: readonly [number, number] }>
> = {
  EG: { code: "20", trunk: "0", digits: [9, 10] },
  SA: { code: "966", trunk: "0", digits: [8, 9] },
  AE: { code: "971", trunk: "0", digits: [8, 9] },
  KW: { code: "965", trunk: "", digits: [8, 8] },
  QA: { code: "974", trunk: "", digits: [8, 8] },
  BH: { code: "973", trunk: "", digits: [8, 8] },
  OM: { code: "968", trunk: "", digits: [8, 8] },
  JO: { code: "962", trunk: "0", digits: [8, 9] },
  LB: { code: "961", trunk: "0", digits: [7, 8] },
  PS: { code: "970", trunk: "0", digits: [8, 9] },
  IQ: { code: "964", trunk: "0", digits: [8, 10] },
  SY: { code: "963", trunk: "0", digits: [8, 9] },
  LY: { code: "218", trunk: "0", digits: [8, 9] },
  SD: { code: "249", trunk: "0", digits: [9, 9] },
  YE: { code: "967", trunk: "0", digits: [8, 9] },
  MA: { code: "212", trunk: "0", digits: [9, 9] },
  DZ: { code: "213", trunk: "0", digits: [8, 9] },
  TN: { code: "216", trunk: "", digits: [8, 8] },
  TR: { code: "90", trunk: "0", digits: [10, 10] },
  GB: { code: "44", trunk: "0", digits: [9, 10] },
  IE: { code: "353", trunk: "0", digits: [7, 9] },
  FR: { code: "33", trunk: "0", digits: [9, 9] },
  BE: { code: "32", trunk: "0", digits: [8, 9] },
  NL: { code: "31", trunk: "0", digits: [9, 9] },
  DE: { code: "49", trunk: "0", digits: [10, 11] },
  CH: { code: "41", trunk: "0", digits: [9, 9] },
  IT: { code: "39", trunk: "", digits: [9, 10] },
  ES: { code: "34", trunk: "", digits: [9, 9] },
  US: { code: "1", trunk: "1", digits: [10, 10] },
  CA: { code: "1", trunk: "1", digits: [10, 10] },
};

/** Country codes whose local numbers start with a 0 the international form drops. */
const ZERO_TRUNK_CODES: readonly string[] = [
  ...new Set(
    Object.values(DIALLING_PLANS)
      .filter((p) => p.trunk === "0")
      .map((p) => p.code),
  ),
];

/**
 * A phone number as we store it: `+`, the country code and the number,
 * Latin digits, separators removed, the `00` international prefix written
 * as `+` (the form `waLinkFor` and the admin's WhatsApp button understand).
 * A 0 typed after a country code whose numbers drop it (`+20 0100 …`, as
 * people write it once told to add +20) is dropped too.
 *
 * Returns null for anything else, a local number included: without its
 * country code a number opens no WhatsApp chat, so it is not a way to reach
 * anyone. 8 to 15 digits, from the shortest a wa.me link takes to the
 * E.164 maximum. `phoneForCountry` turns a local number into this form.
 */
export function normalizePhone(raw: string): string | null {
  const compact = compactPhone(raw);
  let plus = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  const code = ZERO_TRUNK_CODES.find((c) => plus.startsWith(`+${c}0`));
  if (code) plus = `+${code}${plus.slice(code.length + 2)}`;
  return /^\+[1-9]\d{7,14}$/.test(plus) ? plus : null;
}

/**
 * The number in international form, reading a local one (`0100 123 4567`)
 * as a number in `country`: the dialog knows the country, and a couple in
 * Egypt types their number the Egyptian way. Also takes a number typed with
 * its country code but no `+` (`201001234567`). Null when the number is
 * local and the country is unknown or not one we can read numbers for.
 *
 * The dialog shows the result before sending ("We will message +20 …"),
 * because the country field is where the wedding is, which is usually but
 * not always where the couple's phone is from.
 */
export function phoneForCountry(
  raw: string,
  country: string | null | undefined,
): string | null {
  const international = normalizePhone(raw);
  if (international) return international;
  const plan = country ? DIALLING_PLANS[country.toUpperCase()] : undefined;
  const digits = compactPhone(raw);
  if (!plan || !/^\d+$/.test(digits)) return null;
  const [min, max] = plan.digits;
  const fits = (n: string) => n.length >= min && n.length <= max;

  const national =
    plan.trunk && digits.startsWith(plan.trunk) ? digits.slice(plan.trunk.length) : digits;
  if (fits(national)) return normalizePhone(`+${plan.code}${national}`);
  if (digits.startsWith(plan.code) && fits(digits.slice(plan.code.length))) {
    return normalizePhone(`+${digits}`);
  }
  return null;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * The wedding date as a UTC calendar date. A month (`2026-10`) is kept as
 * the 1st of that month with `monthOnly` set, so the enquiry can store it
 * as a flexible date rather than pretend the couple picked the 1st.
 * Returns null for anything else, including impossible days (`2026-02-30`).
 */
export function parseWeddingDate(
  value: string,
): { date: Date; monthOnly: boolean } | null {
  const trimmed = value.trim();
  const month = MONTH.exec(trimmed);
  if (month) {
    return {
      date: new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1)),
      monthOnly: true,
    };
  }
  const day = DAY.exec(trimmed);
  if (!day) return null;
  const [y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC rolls 2026-02-30 over to March; a real day survives unchanged.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { date, monthOnly: false };
}

/**
 * The details, as the approve procedure accepts them. Every field is
 * optional: a lead with only an email is still a lead, and asking is what
 * this is about, not demanding. A blank string reads as "not given" rather
 * than as invalid, so a form can send its fields as they are.
 *
 * The phone must be international here: the dialog has already read a
 * local number against the country (`phoneForCountry`) and sends the result.
 */
export const leadDetailsSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || normalizePhone(v) !== null, {
      message: "PHONE_INVALID",
    })
    .optional(),
  eventDate: z
    .string()
    .trim()
    .max(10)
    .refine((v) => v === "" || parseWeddingDate(v) !== null, {
      message: "DATE_INVALID",
    })
    .optional(),
  city: z.string().trim().max(80).optional(),
  country: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z]{2}$/.test(v), { message: "COUNTRY_INVALID" })
    .transform((v) => v.toUpperCase())
    .optional(),
});

export type LeadDetailsInput = z.input<typeof leadDetailsSchema>;
export type LeadDetails = z.output<typeof leadDetailsSchema>;
