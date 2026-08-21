import { test, expect } from "@playwright/test";

/**
 * The homepage sample studio hands its picks to the real designer.
 *
 * This is the seam where the marketing page becomes the product, and it is
 * held together by three things that are each invisible until they break:
 *
 *  1. **The prefill survives the designer's own reset.** `StudioPrefill`
 *     runs as a sibling *after* `<VenueDesigner/>` so React's tree-order
 *     effects put the reset first. Move the component, or add a one-shot
 *     ref (StrictMode re-runs the reset), and the store is wiped instead
 *     of prefilled. Both mistakes shipped once.
 *  2. **It lands on `basics`, not further in.** Skipping ahead skipped the
 *     guest-count question, and an unset headcount makes the scene
 *     generator assume "about 100 guests" for every visitor arriving from
 *     the homepage.
 *  3. **Junk params degrade to a plain designer**, never to a half-applied
 *     design the visitor did not ask for.
 *
 * The palette assertion reads the real `PaletteCard`, not a synthesised
 * one: the prefill writes `{ name: preset.id }` specifically because that
 * is the shape the card compares against, and a test that checks the store
 * instead of the card would pass while the UI showed nothing selected.
 */

const HANDOFF = "/venue-designer/new?vibe=outdoor_sunset&palette=noir_emerald";

test.describe("sample studio handoff", () => {
  test("lands on basics with the picks applied and the headcount still asked", async ({
    page,
  }) => {
    await page.goto(HANDOFF);

    // The params are stripped so a refresh cannot re-apply over later edits.
    await expect(page).toHaveURL(/\/venue-designer\/new#step=basics$/, {
      timeout: 20_000,
    });

    const stepBody = page.locator("#step-body");
    await expect(stepBody).toBeVisible();

    // Their setting carried over. Asserted through `data-setting` rather than
    // the label (locale-dependent) or "whichever button is pressed" (the
    // guest-count presets on this same step are also `aria-pressed`, and the
    // default setting is `indoor`, so a loose assertion passes on a wiped
    // store, which is the exact failure this test exists to catch).
    await expect(
      stepBody.locator('[data-setting="outdoor"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      stepBody.locator('[data-setting="indoor"]'),
    ).toHaveAttribute("aria-pressed", "false");

    // The one question the studio could not answer is on screen and empty,
    // which is the entire reason this lands on `basics`.
    const guests = page.locator("#guest-count");
    await expect(guests).toBeVisible();
    await expect(guests).toHaveValue("");

    // The palette is genuinely selected on its own step, in the real card.
    await page.evaluate(() => {
      window.location.hash = "#step=palette";
      window.dispatchEvent(new Event("hashchange"));
    });
    const selectedPalette = page
      .locator("#step-body button")
      .filter({ hasText: /Noir|Emerald|زمرّد|Smaragd|émeraude/i })
      .first();
    await expect(selectedPalette).toHaveClass(/border-rose-400/, {
      timeout: 10_000,
    });
  });

  test("malformed params leave a plain designer rather than half a design", async ({
    page,
  }) => {
    await page.goto("/venue-designer/new?vibe=junk&palette=alsojunk");
    await expect(page.locator("#step-body")).toBeVisible({ timeout: 20_000 });

    // No prefill ran, so nothing was stripped and no step jump happened.
    await expect(page).toHaveURL(/vibe=junk/);

    await page.evaluate(() => {
      window.location.hash = "#step=palette";
      window.dispatchEvent(new Event("hashchange"));
    });
    await expect(
      page.locator("#step-body button.border-rose-400"),
    ).toHaveCount(0);
  });
});
