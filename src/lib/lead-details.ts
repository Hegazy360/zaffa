// The optional contact details a couple can leave when they approve a design
// (F5, "Leads that never rot", docs/plan-design-partner-2026-09.md).
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

/** Separators people type inside a phone number (\s covers the no-break space). */
const PHONE_SEPARATORS = /[\s().-]/g;

/**
 * A phone number as we store it: digits with an optional leading `+`,
 * separators removed, and the `00` international prefix written as `+`
 * (the form `waLinkFor` and the admin's WhatsApp button understand).
 * Returns null when what is left is not 6 to 15 digits, the E.164 bounds
 * with room for short local numbers.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(PHONE_SEPARATORS, "");
  const plus = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  return /^\+?\d{6,15}$/.test(plus) ? plus : null;
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
 */
export const leadDetailsSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || (v.length >= 6 && normalizePhone(v) !== null), {
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
