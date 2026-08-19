import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

// Centring an absolutely-positioned element is symmetric, so it must use
// PHYSICAL insets. Pairing a *logical* inset with a *physical* translate is
// correct in LTR and throws the element a full width off-centre in RTL:
//
//   start-1/2 -translate-x-1/2 → RTL: right:50% + translateX(-50%)  ✗
//   end-1/2    translate-x-1/2 → RTL: left:50%  + translateX(+50%)  ✗
//   left-1/2  -translate-x-1/2 → both: centred                      ✓
//
// This shipped in every dialog in the product (ZAF-36) and was invisible to
// anyone testing in English. Arabic is our primary locale.
//
// The e2e RTL spec proves the CSS semantics; this pins the source so the
// component can't quietly regress to the broken pairing.
const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\bstart-1\/2\b[^"'`]*?-translate-x-1\/2/,
    why: "logical `start-1/2` with physical `-translate-x-1/2` — use `left-1/2`",
  },
  {
    pattern: /\bend-1\/2\b[^"'`]*?[^-]translate-x-1\/2/,
    why: "logical `end-1/2` with physical `translate-x-1/2` — use `left-1/2 -translate-x-1/2`",
  },
];

function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("RTL centring", () => {
  it("never pairs a logical inset with a physical translate", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      for (const { pattern, why } of FORBIDDEN) {
        text.split("\n").forEach((line, i) => {
          // Skip prose: these strings are quoted in explanatory comments.
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          if (pattern.test(line)) {
            offenders.push(
              `${path.relative(SRC, file)}:${i + 1} — ${why}`,
            );
          }
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
