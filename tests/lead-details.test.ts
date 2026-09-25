import { describe, expect, it } from "vitest";
import {
  latinDigits,
  leadDetailsSchema,
  normalizePhone,
  parseWeddingDate,
  phoneForCountry,
} from "@/lib/lead-details";

describe("normalizePhone", () => {
  it("keeps an international number, separators dropped", () => {
    expect(normalizePhone("+20 101 234 5678")).toBe("+201012345678");
    expect(normalizePhone("+971 (50) 123-4567")).toBe("+971501234567");
    expect(normalizePhone("+33 7.69.99.97.07")).toBe("+33769999707");
  });

  it("writes the 00 international prefix as +", () => {
    expect(normalizePhone("00201012345678")).toBe("+201012345678");
  });

  it("refuses a local number: without its country code it opens no WhatsApp chat", () => {
    // Stored as typed, this became https://wa.me/01001234567, which
    // WhatsApp does not open. phoneForCountry reads it against a country.
    expect(normalizePhone("0100 123 4567")).toBeNull();
    expect(normalizePhone("01001234567")).toBeNull();
  });

  it("reads Arabic-Indic and Persian digits, as an Arabic keyboard types them", () => {
    expect(normalizePhone("+٢٠١٠٠١٢٣٤٥٦٧")).toBe("+201001234567");
    expect(normalizePhone("+٢٠ ١٠٠ ١٢٣ ٤٥٦٧")).toBe("+201001234567");
    expect(normalizePhone("٠٠٩٧١٥٠١٢٣٤٥٦٧")).toBe("+971501234567");
    expect(normalizePhone("+۹۶۶۵۰۱۲۳۴۵۶۷")).toBe("+966501234567");
  });

  it("drops the invisible direction marks a pasted Arabic number carries", () => {
    expect(normalizePhone("\u202A+20 100 123 4567\u202C")).toBe("+201001234567");
    expect(normalizePhone("\u200E+971 50 123 4567")).toBe("+971501234567");
  });

  it("drops the 0 typed after a country code whose numbers drop it", () => {
    // How people write it once told to add +20.
    expect(normalizePhone("+20 0100 123 4567")).toBe("+201001234567");
    expect(normalizePhone("+966 050 123 4567")).toBe("+966501234567");
    expect(normalizePhone("0044 07700 900123")).toBe("+447700900123");
  });

  it("refuses letters, too few digits and too many", () => {
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    // Fewer than 8 digits: waLinkFor shows no WhatsApp button for these.
    expect(normalizePhone("+123456")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
    expect(normalizePhone("+20 10x 234 5678")).toBeNull();
    expect(normalizePhone("+0100 123 4567")).toBeNull();
  });
});

describe("latinDigits", () => {
  it("maps both Arabic digit sets and leaves everything else", () => {
    expect(latinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(latinDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(latinDigits("+20 abc")).toBe("+20 abc");
  });
});

describe("phoneForCountry", () => {
  it("writes an Egyptian local number the international way", () => {
    expect(phoneForCountry("0100 123 4567", "EG")).toBe("+201001234567");
    expect(phoneForCountry("٠١٠٠١٢٣٤٥٦٧", "eg")).toBe("+201001234567");
    expect(phoneForCountry("۰۱۰۰۱۲۳۴۵۶۷", "EG")).toBe("+201001234567");
    // The national number without its leading 0.
    expect(phoneForCountry("100 123 4567", "EG")).toBe("+201001234567");
  });

  it("takes a number typed with its country code but no +", () => {
    expect(phoneForCountry("201001234567", "EG")).toBe("+201001234567");
    expect(phoneForCountry("966501234567", "SA")).toBe("+966501234567");
  });

  it("knows the Gulf numbers that have no 0 to drop", () => {
    expect(phoneForCountry("0501234567", "AE")).toBe("+971501234567");
    expect(phoneForCountry("0501234567", "SA")).toBe("+966501234567");
    expect(phoneForCountry("9651 2345", "KW")).toBe("+96596512345");
    expect(phoneForCountry("96596512345", "KW")).toBe("+96596512345");
    expect(phoneForCountry("3312 3456", "QA")).toBe("+97433123456");
  });

  it("reads the diaspora's numbers too", () => {
    expect(phoneForCountry("07700 900123", "GB")).toBe("+447700900123");
    expect(phoneForCountry("06 12 34 56 78", "FR")).toBe("+33612345678");
    expect(phoneForCountry("0151 2345 6789", "DE")).toBe("+4915123456789");
    expect(phoneForCountry("(555) 123-4567", "US")).toBe("+15551234567");
    expect(phoneForCountry("1 555 123 4567", "US")).toBe("+15551234567");
    // Italy keeps the 0 of a landline in the international form.
    expect(phoneForCountry("06 1234 5678", "IT")).toBe("+390612345678");
  });

  it("keeps an international number whatever the country says", () => {
    expect(phoneForCountry("+971 50 123 4567", "EG")).toBe("+971501234567");
    expect(phoneForCountry("00971501234567", undefined)).toBe("+971501234567");
  });

  it("will not guess without a country it can read numbers for", () => {
    expect(phoneForCountry("0100 123 4567", undefined)).toBeNull();
    expect(phoneForCountry("0100 123 4567", "")).toBeNull();
    expect(phoneForCountry("0100 123 4567", "BR")).toBeNull();
  });

  it("refuses a local number of the wrong length for the country", () => {
    expect(phoneForCountry("123456", "EG")).toBeNull();
    expect(phoneForCountry("0100 123 45", "EG")).toBeNull();
    expect(phoneForCountry("0100 123 4567 89", "EG")).toBeNull();
    expect(phoneForCountry("call my mum", "EG")).toBeNull();
  });
});

describe("parseWeddingDate", () => {
  it("reads a month as its first day, marked month-only", () => {
    const parsed = parseWeddingDate("2026-10");
    expect(parsed?.monthOnly).toBe(true);
    expect(parsed?.date.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("reads a real day as that day", () => {
    const parsed = parseWeddingDate("2027-02-28");
    expect(parsed?.monthOnly).toBe(false);
    expect(parsed?.date.toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });

  it("refuses impossible days and other shapes", () => {
    expect(parseWeddingDate("2026-02-30")).toBeNull();
    expect(parseWeddingDate("2026-13")).toBeNull();
    expect(parseWeddingDate("10/2026")).toBeNull();
    expect(parseWeddingDate("2026-1")).toBeNull();
    expect(parseWeddingDate("")).toBeNull();
  });
});

describe("leadDetailsSchema", () => {
  it("accepts nothing at all: every detail is optional", () => {
    expect(leadDetailsSchema.parse({})).toEqual({});
  });

  it("reads blank fields as not given rather than as invalid", () => {
    const parsed = leadDetailsSchema.parse({ phone: "  ", eventDate: "", city: "", country: "" });
    expect(parsed).toEqual({ phone: "", eventDate: "", city: "", country: "" });
  });

  it("accepts a number typed in Arabic digits", () => {
    expect(leadDetailsSchema.safeParse({ phone: "+٢٠١٠٠١٢٣٤٥٦٧" }).success).toBe(true);
  });

  it("upper-cases the country and trims the city", () => {
    expect(leadDetailsSchema.parse({ country: "eg", city: "  Cairo " })).toEqual({
      country: "EG",
      city: "Cairo",
    });
  });

  it("rejects a phone that is not a number, a bad date and a long city", () => {
    expect(leadDetailsSchema.safeParse({ phone: "not a phone" }).success).toBe(false);
    // A local number never reaches the server from the dialog; sent by
    // hand, it is refused rather than stored where WhatsApp cannot use it.
    expect(leadDetailsSchema.safeParse({ phone: "0100 123 4567" }).success).toBe(false);
    expect(leadDetailsSchema.safeParse({ phone: "+2010123456789012345678" }).success).toBe(false);
    expect(leadDetailsSchema.safeParse({ eventDate: "2026-02-30" }).success).toBe(false);
    expect(leadDetailsSchema.safeParse({ city: "x".repeat(81) }).success).toBe(false);
    expect(leadDetailsSchema.safeParse({ country: "EGY" }).success).toBe(false);
  });
});
