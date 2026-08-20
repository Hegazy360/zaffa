import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The homepage's copy must be in the server HTML, visible.
 *
 * `motion.div initial={{ opacity: 0 }}` renders into the server response as
 * `style="opacity:0"`. The section is then invisible until the JavaScript
 * bundle loads, hydrates, and an IntersectionObserver fires — on a slow
 * connection that is a blank page where the pitch should be, and if the bundle
 * fails it is a blank page permanently. The hero already learned this and
 * moved to CSS; ZAF-60 moved the other seventeen.
 *
 * This is a source assertion rather than a rendered one, deliberately. I tried
 * it as a Playwright test with `javaScriptEnabled: false` and it could not
 * distinguish the bug from Next's streaming: an RSC page delivers its shell
 * first and patches in the rest with inline scripts, so a JS-disabled browser
 * sees an empty body whether or not the bug is present. The source is where
 * the mistake is made, and the source is unambiguous.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const files = walk(join(process.cwd(), "src"));

describe("entrance animations never hide server-rendered copy", () => {
  it("no component starts an entrance at opacity 0", () => {
    const offenders: string[] = [];
    for (const file of files) {
      // `motion/rise.tsx` documents the pattern it replaces, in prose.
      if (file.includes(join("components", "motion"))) continue;
      const src = readFileSync(file, "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
        if (/initial=\{\{\s*opacity:\s*0/.test(line)) {
          offenders.push(`${file.replace(process.cwd(), "")}:${i + 1}`);
        }
      }
    }
    expect(
      offenders,
      `Use <Rise> instead — it renders visible and animates only once JS is live:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the Rise component itself renders visible by default", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/motion/rise.tsx"),
      "utf8",
    );
    // The animation class is applied from state set in an effect, so it cannot
    // be present in the server render. If someone makes `armed` default to
    // true, every section goes back to being invisible without JS.
    expect(src).toContain("React.useState(false)");
    expect(src).toMatch(/armed && "hero-rise"/);
  });
});
