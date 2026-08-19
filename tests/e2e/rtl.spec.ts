import { test, expect, type Page } from "@playwright/test";

// RTL correctness assertions (ZAF-36; extended by ZAF-69).
//
// Arabic is the primary locale, and RTL bugs are invisible to anyone testing
// in English — which is how every dialog in the product ended up sitting a
// full popup-width off-centre in Arabic without anyone noticing.

const AR = { name: "zaffa_locale", value: "ar", path: "/" };

async function inAr(page: Page, baseURL: string) {
  await page.context().addCookies([{ ...AR, domain: new URL(baseURL).hostname }]);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
}

/**
 * Measures where a fixed-position element actually lands, given a set of
 * centring classes, under the live document direction. Returns the offset of
 * the element's centre from the viewport's centre — 0 means correctly
 * centred.
 */
async function centreOffset(page: Page, classes: string): Promise<number> {
  return page.evaluate((cls) => {
    const el = document.createElement("div");
    el.className = `${cls} fixed top-1/2`;
    el.style.width = "400px";
    el.style.height = "100px";
    el.style.zIndex = "-1";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    el.remove();
    return Math.round(r.left + r.width / 2 - window.innerWidth / 2);
  }, classes);
}

test.describe("RTL", () => {
  test("dialog centring classes centre correctly in Arabic", async ({
    page,
    baseURL,
  }) => {
    await inAr(page, baseURL!);

    // The shipped pairing (physical `left` + physical translate) must centre.
    // Centring is symmetric, so this holds in both directions.
    expect(Math.abs(await centreOffset(page, "left-1/2 -translate-x-1/2"))).toBeLessThanOrEqual(2);

    // The regression guard: the logical pairing this replaced resolves to
    // `right: 50%` under RTL while the translate stays physical, throwing the
    // element a full width off-centre. If this ever stops being wrong,
    // Tailwind's semantics changed and the fix above should be revisited.
    expect(Math.abs(await centreOffset(page, "start-1/2 -translate-x-1/2"))).toBeGreaterThan(100);
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
