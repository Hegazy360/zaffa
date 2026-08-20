import type { ZodErrorMap } from "zod";

/**
 * Zod's messages, in the reader's language.
 *
 * Zod ships English strings - "String must contain at least 2 character(s)",
 * "Invalid email", and a form that renders `issue.message` shows those to an
 * Arabic reader verbatim. Worse, they are written for developers: "Expected
 * string, received number" is a correct description of a bug and a useless
 * thing to say to someone trying to book a wedding.
 *
 * This maps the issue codes we actually produce onto the `errors` namespace.
 * Anything unmapped falls through to a single generic translated line rather
 * than to Zod's English, a vague message in the right language beats a
 * precise one in the wrong language, on a form.
 *
 * Usage: build it with a `t` from `useTranslations("errors")` (or
 * `getTranslations`) and pass it to `.safeParse(value, { error: map })`.
 */
export function createZodErrorMap(
  t: (key: string, values?: Record<string, unknown>) => string,
): ZodErrorMap {
  return (issue) => {
    switch (issue.code) {
      case "invalid_type":
        // Empty input arrives as undefined for most fields, which Zod reports
        // as a type error rather than a "too small" one. To a reader, that is
        // simply a missing answer.
        return issue.input === undefined || issue.input === null
          ? t("required")
          : t("generic");

      case "too_small": {
        const min = Number(issue.minimum);
        if (issue.origin === "string") {
          return min <= 1 ? t("required") : t("tooShort", { min });
        }
        if (issue.origin === "number") return t("numberTooSmall", { min });
        return t("required");
      }

      case "too_big": {
        const max = Number(issue.maximum);
        if (issue.origin === "string") return t("tooLong", { max });
        if (issue.origin === "number") return t("numberTooBig", { max });
        return t("generic");
      }

      case "invalid_format": {
        // `format` carries "email", "url", "regex", … in Zod 4.
        const format = (issue as { format?: string }).format;
        if (format === "email") return t("invalidEmail");
        if (format === "url") return t("invalidUrl");
        return t("invalidFormat");
      }

      case "invalid_value":
      case "invalid_union":
        return t("invalidChoice");

      default:
        return t("generic");
    }
  };
}
