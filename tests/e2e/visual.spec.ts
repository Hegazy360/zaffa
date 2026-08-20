import { test, expect, type Page } from "@playwright/test";

// Visual-regression safety net (ZAF-31 / plan P0.1).
//
// The pivot plan runs mass codemods (brand tokens, dark-mode deletion, type
// floor, image migration) whose PRs claim "pixel-identical". This spec makes
// that claim provable: full-page baselines for the key public surfaces, in
// English AND Arabic, desktop AND mobile. Anything that moves a pixel it
// shouldn't fails here first.
//
// Deliberately excluded from this first net (formalized later by P5.3):
// /v/[slug] and the client dashboard, both depend on DB rows the money-path
// spec mutates, so their baselines would churn between runs. The insurance
// policy has to be *stable* before it is *broad*.
//
// Dynamic content strategy:
// - `[data-visual-mask]` marks sections whose content is DB-driven (the
//   marketplace teaser counts/cards, the per-country tier prices). These are
//   both masked AND collapsed to a fixed height before the shot.
//
//   Masking alone is not enough: Playwright's `mask` paints over pixels but
//   does not remove the element from layout, so a DB-driven section that
//   changes *height* shifts every section below it and the full-page
//   screenshot differs everywhere. That is exactly what happened when the
//   teaser's content changed - the page grew ~1,400px and all four homepage
//   baselines failed despite no styling change. Pinning the height makes the
//   masked regions contribute a constant to layout.
// - reducedMotion: "reduce" (project config) collapses CSS + framer-motion
//   durations via the site's global reduced-motion block.
// - a scroll sweep triggers every whileInView entrance (viewport.once=true
//   keeps them settled) before the shot is taken.

const PAGES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "home", path: "/" },
  { name: "signin", path: "/auth/signin" },
  { name: "contact", path: "/contact" },
  // Pinned to ?market=AE so the shot does not depend on the country cookie:
  // the ar project sets EG and the en project US, which would otherwise give
  // the two baselines different tables and different page heights for reasons
  // that have nothing to do with styling.
  { name: "pricing", path: "/pricing?market=AE" },
];

const LOCALES = [
  // Pin the country cookie per locale so per-country pricing renders
  // deterministically (en→US→USD, ar→EG→EGP).
  { locale: "en", country: "US" },
  { locale: "ar", country: "EG" },
] as const;

/** Collapse DB-driven regions to a constant height so they cannot shift the
 *  rest of the page between runs. Paired with `mask`, which hides whatever
 *  they happen to contain. */
async function pinDynamicRegions(page: Page) {
  await page.addStyleTag({
    content: `[data-visual-mask]{height:480px!important;min-height:480px!important;max-height:480px!important;overflow:hidden!important}`,
  });
}

async function settle(page: Page) {
  // Fonts first, Fraunces/Cairo swap late and shift every headline.
  await page.evaluate(() => document.fonts.ready);
  // NOTE: do not add waits for client-fetched content here. The tier grid
  // (per-country pricing) raced the shot and caused an ~8% diff; the fix is
  // to mask it as dynamic content, not to wait on it - waiting made the
  // suite exceed its per-test timeout and produced no baselines at all.
  // If a surface is non-deterministic, tag it `data-visual-mask`.
  // Sweep the page so every whileInView entrance has fired (once: true
  // keeps elements settled after the sweep), then return to top.
  await page.evaluate(async () => {
    const step = window.innerHeight / 2;
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 200));
  });
}

for (const { locale, country } of LOCALES) {
  test.describe(`visual [${locale}]`, () => {
    test.use({
      // Fresh context per locale, no auth storage state; these are the
      // public surfaces. /venue-designer/new would mint an anonymous
      // Supabase user per context, which adds a network dependency to the
      // shot; it joins the net in P5.3 alongside the seeded surfaces.
      locale: locale === "ar" ? "ar-EG" : "en-US",
    });

    test.beforeEach(async ({ context, baseURL }) => {
      const url = new URL(baseURL!);
      await context.addCookies([
        { name: "zaffa_locale", value: locale, domain: url.hostname, path: "/" },
        { name: "zaffa_country", value: country, domain: url.hostname, path: "/" },
      ]);
    });

    for (const p of PAGES) {
      test(`${p.name}`, async ({ page }) => {
        await page.goto(p.path, { waitUntil: "domcontentloaded" });
        await pinDynamicRegions(page);
        await settle(page);
        await expect(page).toHaveScreenshot(`${p.name}-${locale}.png`, {
          fullPage: true,
          mask: [page.locator("[data-visual-mask]")],
          maxDiffPixelRatio: 0.02,
        });
      });
    }
  });
}
