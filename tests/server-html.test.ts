import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The homepage's copy must be in the server HTML, visible.
 *
 * `motion.div initial={{ opacity: 0 }}` renders into the server response as
 * `style="opacity:0"`. The section is then invisible until the JavaScript
 * bundle loads, hydrates, and an IntersectionObserver fires - on a slow
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
      `Use <Rise> instead - it renders visible and animates only once JS is live:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("Rise ships no client JavaScript", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/motion/rise.tsx"),
      "utf8",
    );
    // The reveal is pure CSS now. A "use client" or a hook here would drag
    // every section that uses it back into the client bundle, the whole
    // reason most of the homepage is server-rendered.
    //
    // Comments are stripped first: this file's header *describes* the
    // IntersectionObserver it replaced, and matching prose would fail on the
    // documentation rather than on the code.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/^"use client"/m);
    expect(code).not.toMatch(/useState|useEffect|IntersectionObserver/);
  });

  it("the hidden start state is unreachable without scroll-driven animation", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    // This is the guarantee, and it is entirely positional: `.rise` must get
    // its animation ONLY inside `@supports (animation-timeline: view())`.
    // `riseIn` starts at `opacity: 0`, so a `.rise` rule outside that block
    // would hide real copy in every browser that cannot run the animation -
    // which is the exact failure this whole file exists to prevent, just
    // arriving via CSS instead of via framer-motion.
    const guardStart = css.indexOf("@supports (animation-timeline: view())");
    expect(guardStart, "the @supports guard must exist").toBeGreaterThan(-1);

    // Walk braces from the guard to find where it closes.
    let depth = 0;
    let guardEnd = -1;
    for (let i = css.indexOf("{", guardStart); i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) {
          guardEnd = i;
          break;
        }
      }
    }
    expect(guardEnd, "the @supports guard must close").toBeGreaterThan(guardStart);

    const inside = css.slice(guardStart, guardEnd);
    const outside = css.slice(0, guardStart) + css.slice(guardEnd);

    expect(inside).toMatch(/\.rise\s*\{/);
    expect(
      outside,
      "`.rise` must not be styled outside the @supports guard - unsupported browsers would render the copy invisible",
    ).not.toMatch(/\.rise\s*\{/);
  });
});
