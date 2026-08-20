import { test, expect } from "@playwright/test";

/**
 * The confirmation dialog, centred, in Arabic.
 *
 * This is the bug class that already shipped once (ZAF-36): `start-1/2` under
 * RTL resolves to `right: 50%` while `-translate-x-1/2` stays physical, which
 * puts the popup a full width off-centre. It is invisible to anyone testing in
 * English, and `tests/rtl-centering.test.ts` only proves the source does not
 * contain the broken pairing, it cannot prove the result is centred.
 *
 * So this measures the rendered popup against the viewport, in both
 * directions, and also checks that Escape resolves the promise rather than
 * leaving the caller awaiting forever.
 */
for (const [locale, dir] of [
  ["en", "ltr"],
  ["ar", "rtl"],
] as const) {
  test(`the confirm dialog is centred in ${locale} (${dir})`, async ({
    page,
    context,
    baseURL,
  }) => {
    const url = new URL(baseURL!);
    await context.addCookies([
      { name: "zaffa_locale", value: locale, domain: url.hostname, path: "/" },
    ]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/kitchen-sink", { waitUntil: "load" });

    await page.getByRole("button", { name: "Open confirm" }).click();
    const popup = page.locator('[data-slot="alert-dialog-content"]');
    await expect(popup).toBeVisible();
    // Let the open animation settle before measuring, a zoom-in transform
    // mid-flight reports a box that is neither the start nor the end.
    await page.waitForTimeout(400);

    const box = (await popup.boundingBox())!;
    const viewport = page.viewportSize()!;
    const popupCentre = box.x + box.width / 2;
    expect(Math.abs(popupCentre - viewport.width / 2)).toBeLessThanOrEqual(2);
  });
}

test("Escape resolves the confirm promise instead of hanging", async ({
  page,
}) => {
  await page.goto("/kitchen-sink", { waitUntil: "load" });
  await page.getByRole("button", { name: "Open confirm" }).click();
  await expect(page.locator('[data-slot="alert-dialog-content"]')).toBeVisible();

  await page.keyboard.press("Escape");
  // If the promise never settled, `last` would stay at its placeholder - which
  // is exactly what a button-only handler would have produced.
  await expect(page.getByText("last: cancelled")).toBeVisible();
});
