import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  DECOR_MARKET_OPTIONS,
  computeDecorPlan,
  isDecorMarket,
} from "../../src/lib/decor-pricing";
import type { DecorAnalysis } from "../../src/lib/decor-analysis";
import { mockTrpc } from "./helpers/trpc-mock";

/**
 * F4, "What it takes to build this": the costed decor plan under a render.
 *
 * `decorPlan.forMedia` and the design it belongs to are answered from the
 * test (the real procedure spends a model call and needs a design with a
 * render), so this pins the panel itself: it appears under the render,
 * expands, re-prices when the currency changes, and on the Arabic phone
 * reads right to left with Latin digits, the money-surface rule (D11).
 *
 * The plan the fake procedure returns is computed by the real
 * `computeDecorPlan`, so the numbers on screen are ones the server would
 * produce for this analysis.
 */

const ANALYSIS: DecorAnalysis = {
  table_shape: "long",
  centerpiece: "mixed",
  has_stage: true,
  has_arch: true,
  has_entrance_decor: true,
  has_dance_floor: true,
  has_draping: false,
  has_chandeliers: true,
  has_string_lights: true,
  candle_density: "lots",
  floral_density: "lush",
  flowers: ["rose", "hydrangea", "baby_breath"],
  linens: "runner_only",
  chair_style: "chiavari",
  questions: [],
};

const EN_QUESTIONS = [
  "Are the roses and hydrangeas fresh or silk?",
  "Can the fairy lights hang from the palm trees?",
  "Does the venue already provide long wooden tables?",
];

const EASTERN_ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;

async function openDesignerWithPlan(page: Page) {
  const designId = randomUUID();
  const renderId = randomUUID();
  const forMediaCalls: Array<Record<string, unknown>> = [];

  await mockTrpc(page, {
    "venueDesigns.getById": () => ({
      id: designId,
      user_id: randomUUID(),
      event_id: null,
      name: "Garden nikah",
      event_type: "wedding",
      setting: "outdoor",
      size: "large",
      guest_count: 180,
      palette: { name: "Blush and gold", colors: ["#f4c2c2", "#d4af37", "#fdf8f0"] },
      references: { overall_vibe: [], tables: [], flowers: [], lighting: [], venue_decor: [] },
      style_notes: "",
      thumbnail: null,
      approved_at: null,
      venue_photo: null,
      selected_media_id: null,
      created_at: new Date("2026-09-20T10:00:00Z"),
      updated_at: new Date("2026-09-21T10:00:00Z"),
      media: [
        {
          id: renderId,
          design_id: designId,
          parent_id: null,
          type: "render",
          url: "/home/examples/hero.avif",
          created_at: new Date("2026-09-21T10:00:00Z"),
          meta: { mode: "generate", instructionRaw: null, confirmation: null },
        },
      ],
    }),
    // Nothing on this page should save a design the test invented.
    "venueDesigns.save": () => ({ id: designId }),
    "decorPlan.forMedia": (input) => {
      const { mediaId, market, locale } = (input ?? {}) as {
        mediaId?: string;
        market?: string;
        locale?: string;
      };
      forMediaCalls.push({ mediaId, market, locale });
      const plan = computeDecorPlan(ANALYSIS, {
        guestCount: 180,
        size: "large",
        setting: "outdoor",
        market: isDecorMarket(market) ? market : "EG",
      });
      return {
        plan,
        // Written in English when the render was read, so only English
        // gets them; every other locale falls back to the UI's own.
        questions: locale === "en" ? EN_QUESTIONS : [],
        seen: {
          flowers: ANALYSIS.flowers,
          tableShape: ANALYSIS.table_shape,
          chairStyle: ANALYSIS.chair_style,
          floralDensity: ANALYSIS.floral_density,
        },
        markets: DECOR_MARKET_OPTIONS,
      };
    },
  });

  await page.goto(`/venue-designer/${designId}#step=generate`);
  return { designId, renderId, forMediaCalls };
}

test.describe("decor plan under the render", () => {
  test("shows the total, expands, and re-prices when the currency changes", async ({
    page,
  }, testInfo) => {
    const { designId, renderId, forMediaCalls } = await openDesignerWithPlan(page);
    const isArabic = testInfo.project.name === "mobile-ar";
    const shots = process.env.DECOR_PLAN_SHOTS;
    // Screenshots are looked at on the phone size the audience uses.
    if (shots && isArabic) await page.setViewportSize({ width: 390, height: 844 });

    const panel = page.getByTestId("decor-plan");
    await expect(panel).toBeVisible({ timeout: 45_000 });
    // It prices the render on screen, the only one this design has.
    expect(forMediaCalls[0]?.mediaId).toBe(renderId);

    const total = panel.getByTestId("decor-plan-total");
    await expect(total).toContainText(/\d/);
    const initialTotal = (await total.textContent()) ?? "";

    // Collapsed until asked: the header is a disclosure button.
    const toggle = panel.locator("button[aria-expanded]");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel.locator('tr[data-item="chair_rental"]')).toBeHidden();

    // Optional screenshots for a human look (DECOR_PLAN_SHOTS=<dir>).
    if (shots) {
      await panel.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.screenshot({
        path: `${shots}/decor-plan-collapsed-${testInfo.project.name}.png`,
      });
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const chairs = panel.locator('tr[data-item="chair_rental"]');
    await expect(chairs).toBeVisible();
    await expect(panel.locator('tr[data-item="dance_floor"]')).toBeVisible();
    // No tent in an outdoor render, no draping without a ceiling.
    await expect(panel.locator('tr[data-item="tent"]')).toHaveCount(0);
    await expect(panel.locator('tr[data-item="ceiling_draping"]')).toHaveCount(0);

    // The market follows the visitor's country by default (Egypt here via
    // the fake), and switching currency asks for the re-priced plan.
    await expect(panel.locator('[data-market="EG"]')).toHaveAttribute("aria-pressed", "true");
    await panel.locator('[data-market="EU"]').click();
    await expect(panel.locator('[data-market="EU"]')).toHaveAttribute("aria-pressed", "true");
    await expect(total).toContainText("€");
    await expect(total).not.toHaveText(initialTotal);
    expect(forMediaCalls.some((c) => c.market === "EU")).toBe(true);

    await panel.locator('[data-market="SA"]').click();
    await expect(panel.getByTestId("decor-plan-table-total")).toContainText(
      isArabic ? /ر\.س|SAR/ : "SAR",
    );

    // Questions to ask the decorator: the model's in English, the UI's own
    // standard three anywhere else.
    const questions = panel.locator("ol > li");
    await expect(questions).toHaveCount(3);
    if (!isArabic) await expect(questions.first()).toHaveText(EN_QUESTIONS[0]);

    // An anonymous visitor cannot approve; the quote CTA goes to the
    // enquiry form with this design attached.
    await expect(panel.locator(`a[href="/enquire?designId=${designId}"]`)).toBeVisible();

    await toggle.click();
    await expect(chairs).toBeHidden();

    if (shots) {
      await panel.locator('[data-market="EG"]').evaluate((el) =>
        (el as HTMLButtonElement).click(),
      );
      await toggle.click();
      await expect(chairs).toBeVisible();
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/decor-plan-${testInfo.project.name}.png` });
      await panel.screenshot({ path: `${shots}/decor-plan-panel-${testInfo.project.name}.png` });
    }
  });

  test("reads right to left with Latin digits in Arabic", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-ar", "Arabic project only");
    await openDesignerWithPlan(page);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const panel = page.getByTestId("decor-plan");
    await expect(panel).toBeVisible({ timeout: 45_000 });
    await panel.locator("button[aria-expanded]").click();
    await expect(panel.locator('tr[data-item="chair_rental"]')).toBeVisible();

    const direction = await panel.evaluate((el) => getComputedStyle(el).direction);
    expect(direction).toBe("rtl");

    // Every amount, quantity and count on a money surface: Latin digits.
    const text = (await panel.innerText()).trim();
    expect(text).toMatch(/[0-9]/);
    expect(text).not.toMatch(EASTERN_ARABIC_DIGITS);
    expect(text).toContain("ج.م");

    // On a phone the rows stack: the item name sits above its numbers.
    const row = panel.locator('tr[data-item="chair_rental"]');
    const name = await row.locator("th").boundingBox();
    const range = await row.locator("td").last().boundingBox();
    expect(name && range && range.y > name.y).toBe(true);
    // Nothing spills sideways at phone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
