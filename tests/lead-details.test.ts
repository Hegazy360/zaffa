import { describe, expect, it } from "vitest";
import {
  leadDetailsSchema,
  normalizePhone,
  parseWeddingDate,
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

  it("keeps a local number as typed, the team can still call it", () => {
    expect(normalizePhone("0101 234 5678")).toBe("01012345678");
  });

  it("refuses letters, too few digits and too many", () => {
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
    expect(normalizePhone("+20 10x 234 5678")).toBeNull();
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

  it("upper-cases the country and trims the city", () => {
    expect(leadDetailsSchema.parse({ country: "eg", city: "  Cairo " })).toEqual({
      country: "EG",
      city: "Cairo",
    });
  });

  it("rejects a phone that is not a number, a bad date and a long city", () => {
    expect(leadDetailsSchema.safeParse({ phone: "not a phone" }).success).toBe(false);
    expect(leadDetailsSchema.safeParse({ phone: "+2010123456789012345678" }).success).toBe(false);
    expect(leadDetailsSchema.safeParse({ eventDate: "2026-02-30" }).success).toBe(false);
    expect(leadDetailsSchema.safeParse({ city: "x".repeat(81) }).success).toBe(false);
    expect(leadDetailsSchema.safeParse({ country: "EGY" }).success).toBe(false);
  });
});
