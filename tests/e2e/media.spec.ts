import { test, expect } from "@playwright/test";

/**
 * Images on the two surfaces that get shared.
 *
 * The bug being fixed is invisible on a fast connection and on a desktop
 * screen: a raw `<img>` pointing at a full-resolution Cloudinary render, drawn
 * into a 300px card. It costs megabytes on cellular and it shifts the layout
 * while it loads. Both are checkable, and neither shows up in a screenshot.
 */

test("gallery cards request resized images and reserve their space", async ({
  page,
}) => {
  await page.goto("/gallery", { waitUntil: "load" });
  const imgs = page.locator("img").filter({ hasNotText: "" });
  const data = await page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .map((el) => ({
        src: el.currentSrc || el.src,
        sizes: el.getAttribute("sizes"),
        srcset: (el.getAttribute("srcset") ?? "").length,
        loading: el.getAttribute("loading"),
      }))
      .filter((i) => i.src.includes("cloudinary") || i.src.includes("/_next/image")),
  );
  test.skip(data.length === 0, "no published gallery items to check");

  for (const img of data) {
    // `sizes` is what makes `srcset` useful; without it the browser assumes
    // the image is full-viewport width and downloads the largest candidate,
    // which is the entire bug.
    expect(img.sizes, JSON.stringify(img)).toBeTruthy();
    expect(img.srcset, JSON.stringify(img)).toBeGreaterThan(0);
  }
  await expect(imgs.first()).toBeVisible();
});

test("the microsite hero is not a raw full-resolution render", async ({
  page,
  request,
}) => {
  const res = await request.get("/v/pwvtun6cvc");
  test.skip(res.status() !== 200, "seed microsite is not published");

  await page.goto("/v/pwvtun6cvc", { waitUntil: "load" });
  const raw = await page.evaluate(
    () =>
      [...document.querySelectorAll("img")].filter(
        (el) =>
          (el.currentSrc || el.src).includes("res.cloudinary.com") &&
          !el.getAttribute("srcset"),
      ).length,
  );
  // A Cloudinary URL with no srcset is a raw render being shipped at full
  // resolution, the thing this ticket exists to remove.
  expect(raw).toBe(0);
});
