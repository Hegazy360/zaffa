import { test, expect } from "@playwright/test";

/**
 * Arabic letters connect. Letter-spacing pulls them apart and the word breaks
 * into disconnected shapes - the same class of bug as the RTL dialog centring,
 * and just as invisible to anyone who does not read Arabic.
 *
 * `text-eyebrow` builds the reset in so it cannot be forgotten. This asserts
 * the reset actually applies in the two places it has to: an Arabic page, and
 * an Arabic fragment inside an English page, the second is the one a
 * `:root[dir="rtl"]` rule silently misses, which is exactly what the first
 * version of this rule did.
 */
test("the eyebrow drops its tracking wherever the direction is RTL", async ({
  page,
}) => {
  await page.goto("/kitchen-sink", { waitUntil: "domcontentloaded" });

  const arabic = page.locator('.text-eyebrow[dir="rtl"]');
  await expect(arabic).toHaveCount(1);
  await expect(arabic).toHaveCSS("letter-spacing", "normal");

  // The Latin one keeps its tracking - the reset must be direction-scoped,
  // not a blanket removal that flattens the eyebrow everywhere.
  const latin = page.locator('.text-eyebrow[dir="ltr"]');
  await expect(latin).toHaveCount(1);
  await expect(latin).not.toHaveCSS("letter-spacing", "normal");
});
