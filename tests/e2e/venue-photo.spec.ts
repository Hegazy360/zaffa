import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * F1, "Your venue, dressed", from the visitor's side.
 *
 *  1. The homepage before/after slider is a real slider: focusable, and
 *     ArrowRight moves it. In Arabic it moves the other way, because the
 *     frame is mirrored ("before" sits on the right) and the arrow follows
 *     the screen, which is the whole RTL contract of the component.
 *  2. The basics step offers "Your venue", and a photo picked there comes
 *     back as a thumbnail and turns the generate step into "we'll dress
 *     your venue photo", with Generate available without any references.
 *
 * The upload itself is answered by a route mock: CI runs against stub
 * Cloudinary credentials, and what is under test here is the card, the
 * client-side downscale (which runs for real on the fixture) and the store,
 * not Cloudinary. The server half is covered by the router tests.
 */

const FIXTURE = path.join(__dirname, "fixtures", "venue-hall.jpg");

async function mockVenueUpload(page: Page) {
  let uploads = 0;
  await page.route(
    (url) => url.pathname.endsWith("/api/trpc/venueDesigns.uploadVenuePhoto"),
    async (route) => {
      uploads++;
      const body = route.request().postData() ?? "";
      // The card sends the downscaled JPEG, never the raw file.
      expect(body).toContain("data:image/jpeg;base64,");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            result: {
              data: {
                json: {
                  // A local asset, so the thumbnail loads without a network.
                  url: "/home/venue/hall-before.avif",
                  publicId: "zaffa-venues/e2e/hall",
                  width: 1600,
                  height: 900,
                },
              },
            },
          },
        ]),
      });
    },
  );
  return () => uploads;
}

test.describe("your venue, dressed", () => {
  test("the homepage compare slider answers the keyboard", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("[data-venue-dressed-section]");
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    const slider = section.getByRole("slider");
    await expect(slider).toHaveAttribute("aria-valuenow", "50");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).not.toHaveAttribute("aria-valuenow", "50");

    // Right on screen is toward inline-end in LTR (more "before") and
    // toward inline-start in RTL (less "before").
    const rtl = (await page.locator("html").getAttribute("dir")) === "rtl";
    await expect(slider).toHaveAttribute("aria-valuenow", rtl ? "45" : "55");

    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "100");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");

    // The second example starts back at the middle.
    await section.locator('[data-venue-example="garden"]').click();
    await expect(section.getByRole("slider")).toHaveAttribute("aria-valuenow", "50");

    // The CTA lands on the step with the venue card.
    await expect(section.locator("[data-venue-dressed-cta]")).toHaveAttribute(
      "href",
      "/venue-designer/new#step=basics",
    );
  });

  test("a venue photo added on basics is what the render will dress", async ({
    page,
  }) => {
    const uploads = await mockVenueUpload(page);
    await page.goto("/venue-designer/new#step=basics");

    const card = page.locator("[data-venue-photo-card]");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.locator("img")).toHaveCount(0);

    await card.locator("[data-venue-photo-input]").setInputFiles(FIXTURE);
    await expect(card.locator("img")).toBeVisible({ timeout: 15_000 });
    expect(uploads()).toBe(1);

    // No references at all: the venue photo alone is enough to render.
    await page.evaluate(() => {
      window.location.hash = "#step=generate";
      window.dispatchEvent(new Event("hashchange"));
    });
    const summary = page.locator("[data-venue-photo-summary]");
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary.locator("img")).toBeVisible();
    await expect(page.locator("[data-generate-render]")).toBeEnabled();

    // Back on basics, Remove takes it off the design again.
    await page.evaluate(() => {
      window.location.hash = "#step=basics";
      window.dispatchEvent(new Event("hashchange"));
    });
    await expect(card.locator("img")).toBeVisible();
    await card.locator("[data-venue-photo-remove]").click();
    await expect(card.locator("img")).toHaveCount(0);
  });
});
