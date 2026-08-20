import { describe, expect, it } from "vitest";
import { ogRtlLine, stripArabicMarks } from "@/lib/og";

/**
 * These guard a workaround, not a feature — which is exactly why they matter.
 * Satori has no bidi: it shapes each Arabic word correctly but lays the words
 * out left to right, so an Arabic headline renders as the sentence backwards.
 * `ogRtlLine` reverses the word sequence to compensate. If someone later
 * "simplifies" it away because it looks pointless, these fail.
 */
describe("ogRtlLine", () => {
  it("leaves left-to-right text exactly as written", () => {
    expect(ogRtlLine("Getting married? We've got all of it.", false)).toBe(
      "Getting married? We've got all of it.",
    );
  });

  it("reverses word order for Arabic, so it reads correctly right-to-left", () => {
    // Laid out left-to-right by Satori, this renders as the original sentence
    // read from the right.
    expect(ogRtlLine("بتتجوزوا؟ إحنا معاكم", true)).toBe(
      "معاكم إحنا بتتجوزوا؟",
    );
  });

  it("keeps punctuation attached to its word", () => {
    // The full stop must travel with the word it terminates, so it lands on
    // the left of that word — where a full stop belongs in RTL.
    expect(ogRtlLine("في كل حاجة.", true)).toBe("حاجة. كل في");
  });

  it("collapses runs of whitespace rather than emitting empty words", () => {
    expect(ogRtlLine("  واحد   اثنان  ", true)).toBe("اثنان واحد");
  });

  it("is an involution on a single line", () => {
    const line = "فريق واحد لفرح كامل";
    expect(ogRtlLine(ogRtlLine(line, true), true)).toBe(line);
  });
});

describe("stripArabicMarks", () => {
  it("removes shadda, which Satori positions over the wrong letter", () => {
    expect(stripArabicMarks("بتتجوّزوا")).toBe("بتتجوزوا");
    expect(stripArabicMarks("زفّة")).toBe("زفة");
  });

  it("leaves letters and Latin text untouched", () => {
    expect(stripArabicMarks("زفاف Zaffa 2026")).toBe("زفاف Zaffa 2026");
  });

  it("is applied by ogRtlLine, so cards never carry misplaced marks", () => {
    expect(ogRtlLine("بتتجوّزوا؟ إحنا", true)).toBe("إحنا بتتجوزوا؟");
  });
});
