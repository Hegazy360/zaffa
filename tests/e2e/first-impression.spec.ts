import { test, expect } from "@playwright/test";

/**
 * The states a visitor meets before anything else works.
 *
 * All three shipped English-only or unbranded, and none of them is reachable
 * from a normal happy-path test — a 404 only happens when something is already
 * wrong, which is exactly when nobody is looking. These assertions are how a
 * regression here gets caught.
 */

test.describe("404", () => {
  test("is in Arabic, and right-to-left, for an Arabic visitor", async ({
    page,
    context,
    baseURL,
  }) => {
    const url = new URL(baseURL!);
    await context.addCookies([
      { name: "zaffa_locale", value: "ar", domain: url.hostname, path: "/" },
    ]);

    const res = await page.goto("/this-page-does-not-exist", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBe(404);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    // The old page said "Page Not Found" in every language.
    await expect(page.getByText("Page Not Found")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("مش هنا");

    // It keeps the chrome, so a lost visitor can carry on rather than being
    // handed a single "Go Home" button. Asserted on the banner landmark, not
    // `navigation` — the navbar is a <header> and its desktop links are not
    // yet wrapped in a <nav>, which ZAF-62 owns.
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeAttached();
  });

  test("is in English for an English visitor", async ({ page, context, baseURL }) => {
    const url = new URL(baseURL!);
    await context.addCookies([
      { name: "zaffa_locale", value: "en", domain: url.hostname, path: "/" },
    ]);
    await page.goto("/this-page-does-not-exist", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "This page isn't here.",
    );
  });
});

test("the loading state carries no untranslatable copy", async ({ page }) => {
  // `loading.tsx` renders before messages resolve, so any text in it would be
  // English for every visitor. Asserting on the source of the rendered module
  // is not possible from here; asserting the built markup is. The route is
  // deliberately chosen as one with a route-level loading state.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0);
});
