import { describe, expect, it } from "vitest";
import { z } from "zod";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";
import { createZodErrorMap } from "@/lib/zod-i18n";

/**
 * The point of the error map is that a reader never sees Zod's own English.
 * These tests assert on the *rendered* message for each locale, because the
 * failure mode is silent: an unmapped issue code falls through to
 * "String must contain at least 2 character(s)" and looks like a real message
 * until somebody reads it in Arabic.
 */

function translator(messages: typeof enMessages) {
  return (key: string, values?: Record<string, unknown>) => {
    const raw = (messages.errors as Record<string, string>)[key];
    if (!raw) throw new Error(`missing errors.${key}`);
    return raw.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? `{${k}}`));
  };
}

const en = createZodErrorMap(translator(enMessages));
const ar = createZodErrorMap(translator(arMessages));

function messageFor(schema: z.ZodType, value: unknown, map = en): string {
  const result = schema.safeParse(value, { error: map });
  expect(result.success).toBe(false);
  return result.error!.issues[0]!.message;
}

describe("createZodErrorMap", () => {
  it("reports an empty required field as missing, not as a type error", () => {
    // Zod calls this `invalid_type` because the value is undefined. To a
    // reader filling in a form it is simply a blank field.
    expect(messageFor(z.string(), undefined)).toBe(enMessages.errors.required);
  });

  it("distinguishes a blank string from one that is merely short", () => {
    expect(messageFor(z.string().min(1), "")).toBe(enMessages.errors.required);
    expect(messageFor(z.string().min(4), "ab")).toContain("4");
  });

  it("translates the email format message", () => {
    expect(messageFor(z.email(), "nope")).toBe(enMessages.errors.invalidEmail);
    expect(messageFor(z.email(), "nope", ar)).toBe(
      arMessages.errors.invalidEmail,
    );
  });

  it("never leaks Zod's own English", () => {
    const cases: Array<[z.ZodType, unknown]> = [
      [z.string().min(2), "a"],
      [z.string().max(3), "abcd"],
      [z.number().min(10), 4],
      [z.number().max(10), 40],
      [z.email(), "x"],
      [z.url(), "x"],
      [z.enum(["a", "b"]), "c"],
      [z.string(), 42],
    ];
    const arabic = Object.values(arMessages.errors);
    for (const [schema, value] of cases) {
      const msg = messageFor(schema, value, ar);
      expect(
        arabic.some((m) => msg.startsWith(m.split("{")[0]!.trim())),
        `unmapped issue leaked: "${msg}"`,
      ).toBe(true);
      expect(msg).not.toMatch(/[A-Za-z]{4,}/);
    }
  });
});
