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
 *     your venue photo", with Generate available without any references
 *     and a timing hint that says a minute, not 30 seconds.
 *  3. When the design cannot be saved, Generate does not send a venue
 *     render at all: without the saved design the server cannot see the
 *     photo and would spend the couple's render on an imagined hall.
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

/**
 * The generate step reads the brief with the intake check (F3), a paid LLM
 * call. Nothing here is about it (tests/e2e/intake-check.spec.ts is), so it
 * never reaches the model: the card simply stays away, as after any failed
 * check.
 */
async function blockIntakeCheck(page: Page) {
  await page.route(
    (url) => url.pathname.includes("ai.checkIntake"),
    (route) => route.abort(),
  );
}

async function goToStep(page: Page, step: "basics" | "generate") {
  await page.evaluate((s) => {
    window.location.hash = `#step=${s}`;
    window.dispatchEvent(new Event("hashchange"));
  }, step);
}

async function isRtl(page: Page): Promise<boolean> {
  return (await page.locator("html").getAttribute("dir")) === "rtl";
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
    await blockIntakeCheck(page);
    await page.goto("/venue-designer/new#step=basics");

    const card = page.locator("[data-venue-photo-card]");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.locator("img")).toHaveCount(0);

    await card.locator("[data-venue-photo-input]").setInputFiles(FIXTURE);
    await expect(card.locator("img")).toBeVisible({ timeout: 15_000 });
    expect(uploads()).toBe(1);

    // No references at all: the venue photo alone is enough to render.
    await goToStep(page, "generate");
    const summary = page.locator("[data-venue-photo-summary]");
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary.locator("img")).toBeVisible();
    await expect(page.locator("[data-generate-render]")).toBeEnabled();
    // Dressing a photo takes about a minute; the hint says so.
    await expect(page.locator("[data-render-time-hint]")).toContainText(
      (await isRtl(page)) ? "دقيقة" : "minute",
    );

    // Back on basics, Remove takes it off the design again.
    await goToStep(page, "basics");
    await expect(card.locator("img")).toBeVisible();
    await card.locator("[data-venue-photo-remove]").click();
    await expect(card.locator("img")).toHaveCount(0);
  });

  test("a venue render is not sent when the design cannot be saved", async ({
    page,
  }) => {
    await mockVenueUpload(page);
    await blockIntakeCheck(page);
    // Every design save fails (not saveMedia).
    await page.route(
      (url) => /\/api\/trpc\/.*venueDesigns\.save(?!Media)/.test(url.pathname),
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify([
            {
              error: {
                json: {
                  message: "timeout",
                  code: -32603,
                  data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
                },
              },
            },
          ]),
        }),
    );
    // A safety net as much as an assertion: a render that got through
    // would otherwise reach the real model.
    let renders = 0;
    await page.route(
      (url) => url.pathname.includes("ai.renderScene"),
      (route) => {
        renders++;
        return route.abort();
      },
    );

    await page.goto("/venue-designer/new#step=basics");
    const card = page.locator("[data-venue-photo-card]");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.locator("[data-venue-photo-input]").setInputFiles(FIXTURE);
    await expect(card.locator("img")).toBeVisible({ timeout: 15_000 });

    await goToStep(page, "generate");
    const generate = page.locator("[data-generate-render]");
    await expect(generate).toBeEnabled({ timeout: 15_000 });
    await generate.click();

    const saveFailed = (await isRtl(page))
      ? "نحفظ التصميم"
      : "couldn't save your design";
    await expect(
      page.getByRole("alert").filter({ hasText: saveFailed }),
    ).toBeVisible();
    expect(renders).toBe(0);
    await expect(generate).toBeEnabled();
  });
});
