import {test, expect } from "@playwright/test";

// RTL correctness assertions (ZAF-36; extended by ZAF-69).
//
// Arabic is the primary locale, and RTL bugs are invisible to anyone testing
// in English — which is how every dialog in the product ended up sitting a
// full popup-width off-centre in Arabic without anyone noticing.

const AR = { name: "zaffa_locale", value: "ar", path: "/" };

test.describe("RTL", () => {
  test("the shipped dialog is centred, in this direction", async ({ page }) => {
    // Measured on a **real** `<Dialog>`, not on a synthesised div carrying the
    // class pairing. The previous version of this test asserted the geometry
    // of `left-1/2` versus `start-1/2` — which proved Tailwind's semantics and
    // said nothing about which pairing the component ships. Re-introducing the
    // bug left it green. This one fails.
    await page.goto("/kitchen-sink", { waitUntil: "load" });
    await page.getByRole("button", { name: "Open dialog" }).click();

    const popup = page.locator('[data-slot="dialog-content"]');
    await expect(popup).toBeVisible();
    // The open animation zooms; measuring mid-flight reports a box that is
    // neither the start nor the end.
    await page.waitForTimeout(400);

    const box = (await popup.boundingBox())!;
    const viewport = page.viewportSize()!;
    const centre = box.x + box.width / 2;
    expect(Math.abs(centre - viewport.width / 2)).toBeLessThanOrEqual(2);
  });

  test("loading spinners still animate under reduced motion", async ({
    browser,
    baseURL,
  }) => {
    // `animation-iteration-count: 1 !important` on `*` froze all 163
    // `animate-spin` loaders after one 0.01ms rotation, so every loading
    // state looked like a hung app for reduced-motion users.
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const p = await ctx.newPage();
    await p.context().addCookies([
      { ...AR, domain: new URL(baseURL!).hostname },
    ]);
    await p.goto("/", { waitUntil: "domcontentloaded" });

    const spinner = await p.evaluate(() => {
      const el = document.createElement("div");
      el.className = "animate-spin";
      document.body.appendChild(el);
      const cs = getComputedStyle(el);
      const out = {
        duration: cs.animationDuration,
        iterations: cs.animationIterationCount,
      };
      el.remove();
      return out;
    });
    // getComputedStyle serialises durations in seconds and may use
    // exponential notation ("1e-05s" for 0.01ms), so compare numerically
    // rather than by string.
    const seconds = (v: string) => Number.parseFloat(v);
    // Must NOT be collapsed to the 0.01ms/1-iteration reset.
    expect(seconds(spinner.duration)).toBeGreaterThan(0.1);
    expect(spinner.iterations).toBe("infinite");

    // Ordinary animated elements SHOULD still be collapsed.
    const ordinary = await p.evaluate(() => {
      const el = document.createElement("div");
      el.className = "animate-in fade-in-0";
      document.body.appendChild(el);
      const d = getComputedStyle(el).animationDuration;
      el.remove();
      return d;
    });
    expect(seconds(ordinary)).toBeLessThan(0.001);

    await ctx.close();
  });
});
