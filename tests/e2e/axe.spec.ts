import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import allowlist from "./axe-allowlist.json";

/**
 * Accessibility, as a ratchet rather than an audit.
 *
 * Serious and critical violations only. The lower severities are real but they
 * are also numerous and largely cosmetic, and a gate that fires on everything
 * gets muted — which costs more than it saves. Serious and critical are the
 * ones that stop somebody using the product.
 *
 * Runs in both projects, because half of what this catches is direction- and
 * viewport-dependent: contrast changes with the surface, and a touch target
 * that is fine on a desktop hover is not on a phone.
 *
 * Anything already broken goes in `axe-allowlist.json` with a ticket id.
 * Entries may be deleted freely; adding one is a visible act in review.
 */

// Reduced motion, and not for the reason it looks like. axe resolves an
// element's background colour by walking up until it finds an opaque
// ancestor — and an element mid-entrance-animation has an opacity below 1, so
// axe skips its real background and measures the section behind it. That
// reported a white button on the dark plate as "contrast 1.05:1", which is
// a measurement artefact, not a defect: the button is `rgb(255,255,255)` with
// stone-950 text once the animation settles. Collapsing motion makes the
// contrast maths correct.
test.use({ contextOptions: { reducedMotion: "reduce" } });

type Allow = { rule: string; pages: string[]; ticket: string; note: string };
type Exclude = { pages: string[]; selector: string; reason: string };
const ALLOWED = (allowlist.allow ?? []) as Allow[];
const EXCLUDED = (allowlist.exclude ?? []) as Exclude[];

const PAGES = [
  { name: "home", path: "/" },
  { name: "pricing", path: "/pricing" },
  { name: "gallery", path: "/gallery" },
  { name: "enquire", path: "/enquire" },
  { name: "signin", path: "/auth/signin" },
  { name: "contact", path: "/contact" },
] as const;

for (const page_ of PAGES) {
  test(`${page_.name} has no serious or critical accessibility violations`, async ({
    page,
  }) => {
    await page.goto(page_.path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    let builder = new AxeBuilder({ page }).withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
    ]);
    for (const ex of EXCLUDED) {
      if (ex.pages.includes(page_.name)) builder = builder.exclude(ex.selector);
    }
    const results = await builder.analyze();

    const blocking = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .filter(
        (v) =>
          !ALLOWED.some(
            (a) => a.rule === v.id && a.pages.includes(page_.name),
          ),
      );

    // Report the element, not just the rule — "color-contrast failed" is not
    // actionable; "this button, this ratio" is.
    const detail = blocking
      .map(
        (v) =>
          `${v.impact} · ${v.id} — ${v.help}\n` +
          v.nodes
            .slice(0, 3)
            .map((n) => `    ${n.target.join(" ")}\n    ${n.failureSummary?.split("\n")[1] ?? ""}`)
            .join("\n"),
      )
      .join("\n\n");

    expect(blocking, `\n${detail}\n`).toEqual([]);
  });
}
