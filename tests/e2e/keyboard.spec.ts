import { test, expect } from "@playwright/test";

/**
 * Keyboard-only reachability, and "you are here" said out loud.
 *
 * Two failure modes this covers, both invisible to a mouse user:
 *
 *  - A card whose whole surface is clickable but whose anchor is not reachable
 *    by tab, or is reachable with no visible focus. The link-overlay pattern
 *    (a real anchor with an absolutely-inset ::after, and the ring on the
 *    card) is what makes it work, and it also keeps middle-click and
 *    long-press-share working, which matters in a WhatsApp culture.
 *  - Active navigation state communicated by colour alone. `aria-current` is
 *    the single source of truth now, with the styling driven by it, so the
 *    two cannot drift.
 */

test("every gallery card is reachable by keyboard and shows focus", async ({
  page,
}) => {
  await page.goto("/gallery", { waitUntil: "load" });
  const cards = page.locator('a[href^="/v/"]');
  const count = await cards.count();
  test.skip(count === 0, "no published gallery items");

  // Tab until the first card has focus, then confirm something visible marks
  // it, a ring on the card or an outline on the anchor.
  let focused = false;
  for (let i = 0; i < 40 && !focused; i++) {
    await page.keyboard.press("Tab");
    focused = await cards.first().evaluate((el) => el === document.activeElement);
  }
  expect(focused, "the first gallery card should be reachable by Tab").toBe(true);

  const marked = await cards.first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const parent = el.closest("[class]") as HTMLElement | null;
    const pcs = parent ? getComputedStyle(parent) : null;
    return (
      cs.outlineStyle !== "none" ||
      cs.boxShadow !== "none" ||
      (pcs ? pcs.boxShadow !== "none" : false)
    );
  });
  expect(marked, "a focused card must be visibly focused").toBe(true);
});

test("the pricing market switcher marks the current market", async ({ page }) => {
  await page.goto("/pricing?market=EG", { waitUntil: "load" });
  const current = page.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("href", /market=EG/);

  await page.goto("/pricing?market=AE", { waitUntil: "load" });
  await expect(page.locator('[aria-current="page"]')).toHaveAttribute(
    "href",
    /market=AE/,
  );
});

test("landmarks are labelled where there is more than one of a kind", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "load" });
  const navs = page.locator("nav");
  const n = await navs.count();
  for (let i = 0; i < n; i++) {
    const nav = navs.nth(i);
    const label = await nav.evaluate(
      (el) => el.getAttribute("aria-label") ?? el.getAttribute("aria-labelledby"),
    );
    // A single unlabelled nav is fine; more than one is a screen reader
    // announcing "navigation" repeatedly with no way to tell them apart.
    if (n > 1) expect(label, `nav #${i} needs a label`).toBeTruthy();
  }
});
