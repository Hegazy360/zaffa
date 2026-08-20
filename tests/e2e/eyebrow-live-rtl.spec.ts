import { test, expect } from "@playwright/test";

/**
 * ZAF-29, closed by measurement rather than by eye.
 *
 * Wide letter-spacing breaks Arabic glyph joining: the letters stop connecting
 * and the word reads as loose shapes. It was live across ten homepage sections
 * with eight different hand-written tracking values. They are all
 * `text-eyebrow` now, which resets tracking under RTL — this asserts that on
 * the real page, in Arabic, for every one of them.
 */
test("no eyebrow on the Arabic homepage carries letter-spacing", async ({
  page,
  context,
  baseURL,
}) => {
  const url = new URL(baseURL!);
  await context.addCookies([
    { name: "zaffa_locale", value: "ar", domain: url.hostname, path: "/" },
  ]);
  await page.goto("/", { waitUntil: "load" });

  const spaced = await page.evaluate(() =>
    [...document.querySelectorAll(".text-eyebrow")]
      .map((el) => ({
        text: (el.textContent ?? "").trim().slice(0, 24),
        spacing: getComputedStyle(el).letterSpacing,
      }))
      .filter((x) => x.spacing !== "normal" && x.spacing !== "0px"),
  );
  expect(spaced, JSON.stringify(spaced)).toEqual([]);

  const total = await page.locator(".text-eyebrow").count();
  expect(total, "the homepage should still have eyebrows").toBeGreaterThan(3);
});
