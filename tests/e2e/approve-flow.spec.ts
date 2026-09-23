import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { DECOR_MARKET_OPTIONS, computeDecorPlan } from "../../src/lib/decor-pricing";
import type { DecorAnalysis } from "../../src/lib/decor-analysis";
import { mockTrpc } from "./helpers/trpc-mock";
import { fakeCoupleSession } from "./helpers/fake-couple-session";

/**
 * F5, "Leads that never rot": approving a design asks, optionally, how to
 * reach the couple, pins the version on screen, and then says what happens
 * next with a WhatsApp chat that names the design.
 *
 * Approval needs a permanent account, and this matrix runs signed out
 * against a database that must never get test accounts, so the browser is
 * told a couple is signed in (`fakeCoupleSession`) and every procedure the
 * flow touches is answered here. `venueDesigns.approve` records what the
 * dialog sent; nothing reaches the real one.
 *
 * Also pins the email typo hint on the enquiry form (the real case,
 * `@2008gmail.com`).
 */

const ANALYSIS: DecorAnalysis = {
  table_shape: "round",
  centerpiece: "tall",
  has_stage: true,
  has_arch: false,
  has_entrance_decor: true,
  has_dance_floor: true,
  has_draping: false,
  has_chandeliers: false,
  has_string_lights: true,
  candle_density: "lots",
  floral_density: "lush",
  flowers: ["rose", "baby_breath"],
  linens: "floor_length",
  chair_style: "chiavari",
  questions: [],
};

const EASTERN_ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;

async function openDesigner(page: Page) {
  const userId = randomUUID();
  const designId = randomUUID();
  const olderId = randomUUID();
  const newerId = randomUUID();
  const approveCalls: Array<Record<string, unknown>> = [];
  let approved = false;

  await fakeCoupleSession(page, { id: userId, email: "noor@example.com" });

  const design = () => ({
    id: designId,
    user_id: userId,
    event_id: null,
    name: "Garden nikah",
    event_type: "wedding",
    setting: "outdoor",
    size: "large",
    guest_count: 180,
    palette: { name: "White and gold", colors: ["#ffffff", "#d4af37", "#f4ede1"] },
    references: { overall_vibe: [], tables: [], flowers: [], lighting: [], venue_decor: [] },
    style_notes: "",
    thumbnail: null,
    approved_at: approved ? new Date() : null,
    venue_photo: null,
    selected_media_id: approved ? newerId : null,
    created_at: new Date("2026-09-20T10:00:00Z"),
    updated_at: new Date("2026-09-21T10:00:00Z"),
    // Newest first, as getById orders media.
    media: [
      {
        id: newerId,
        design_id: designId,
        parent_id: olderId,
        type: "render",
        url: "/home/examples/hero.avif",
        created_at: new Date("2026-09-21T10:00:00Z"),
        meta: { mode: "refine", instructionRaw: "more candles", confirmation: null },
      },
      {
        id: olderId,
        design_id: designId,
        parent_id: null,
        type: "render",
        url: "/home/examples/collage-2.avif",
        created_at: new Date("2026-09-20T10:00:00Z"),
        meta: { mode: "generate", instructionRaw: null, confirmation: null },
      },
    ],
  });

  await mockTrpc(page, {
    "venueDesigns.getById": design,
    "venueDesigns.save": () => ({ id: designId }),
    "profile.me": () => ({
      id: userId,
      role: "client",
      full_name: "Noor Hassan",
      avatar_url: null,
      phone: null,
      locale: "en",
      created_at: new Date("2026-09-01T10:00:00Z"),
      email: "noor@example.com",
    }),
    "visionPacks.current": () => ({
      id: randomUUID(),
      sku: "wedding_free_taste_v1",
      status: "active",
      event_id: null,
      microsite_slug: null,
      microsite_published_at: null,
      microsite_public: false,
    }),
    "decorPlan.forMedia": (input) => {
      const { market } = (input ?? {}) as { market?: "EG" | "AE" | "SA" | "EU" | "US" };
      return {
        plan: computeDecorPlan(ANALYSIS, {
          guestCount: 180,
          size: "large",
          setting: "outdoor",
          market: market ?? "EG",
        }),
        questions: [],
        seen: { flowers: ANALYSIS.flowers, tableShape: "round", chairStyle: "chiavari", floralDensity: "lush" },
        markets: DECOR_MARKET_OPTIONS,
      };
    },
    "venueDesigns.approve": (input) => {
      approveCalls.push(input as Record<string, unknown>);
      approved = true;
      return {
        ok: true,
        alreadyApproved: false,
        enquiryId: "c0ffee12-3456-4789-8abc-def012345678",
        detailsAdded: false,
      };
    },
  });

  await page.goto(`/venue-designer/${designId}#step=generate`);
  return { designId, olderId, newerId, approveCalls };
}

test.describe("approving a design", () => {
  test("asks how to reach the couple, pins the version, then says what happens next", async ({
    page,
  }, testInfo) => {
    const isArabic = testInfo.project.name === "mobile-ar";
    const m = isArabic ? ar : en;
    const shots = process.env.APPROVE_FLOW_SHOTS;
    // Screenshots are looked at on the phone size the audience uses.
    if (shots && isArabic) await page.setViewportSize({ width: 390, height: 844 });

    const { designId, newerId, approveCalls } = await openDesigner(page);

    // The decor plan's quote button is one of the approve entry points.
    const plan = page.getByTestId("decor-plan");
    await expect(plan).toBeVisible({ timeout: 45_000 });
    // The quote button sits in the plan, which opens on request.
    await plan.locator("button[aria-expanded]").click();
    await plan.getByRole("button", { name: m.decorPlan.ctaQuote }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(m.approveFlow.intro)).toBeVisible();

    const phone = dialog.getByLabel(m.approveFlow.phoneLabel);
    // Numbers read left to right even on the Arabic page.
    await expect(phone).toHaveAttribute("dir", "ltr");
    await phone.fill("+20 101 234 5678");
    await dialog.getByLabel(m.approveFlow.dateLabel).fill("2026-10");
    await dialog.getByLabel(m.approveFlow.cityLabel).fill(isArabic ? "القاهرة" : "Cairo");
    const country = dialog.getByLabel(m.approveFlow.countryLabel);
    await country.fill(isArabic ? "مصر" : "Egypt");
    await page.getByRole("option", { name: isArabic ? /مصر/ : /Egypt/ }).first().click();

    if (shots) {
      await page.screenshot({ path: `${shots}/approve-form-${testInfo.project.name}.png` });
    }

    await dialog.getByRole("button", { name: m.approveFlow.submit }).click();

    const success = dialog.getByTestId("approve-success");
    await expect(success).toBeVisible();
    expect(approveCalls).toHaveLength(1);
    expect(approveCalls[0]).toMatchObject({
      designId,
      // The newest render: the version on screen when nothing else is active.
      mediaId: newerId,
      phone: "+20 101 234 5678",
      eventDate: "2026-10",
      city: isArabic ? "القاهرة" : "Cairo",
      country: "EG",
    });

    await expect(success.getByText(m.approveFlow.nextTitle)).toBeVisible();
    const wa = success.getByRole("button", { name: m.approveFlow.whatsappCta });
    const href = decodeURIComponent((await wa.getAttribute("href")) ?? "");
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(href).toContain("Garden nikah");
    expect(href).toContain("C0FFEE12");

    if (isArabic) {
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const direction = await dialog.evaluate((el) => getComputedStyle(el).direction);
      expect(direction).toBe("rtl");
      // An approval is a money surface: Latin digits (the 24 hours here).
      expect(await success.innerText()).not.toMatch(EASTERN_ARABIC_DIGITS);
    }
    // Nothing spills sideways at phone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    if (shots) {
      await page.screenshot({ path: `${shots}/approve-success-${testInfo.project.name}.png` });
    }

    // Done closes it, and the plan now says the team has the design.
    await success.getByRole("button", { name: m.approveFlow.done }).click();
    await expect(dialog).toBeHidden();
    await expect(plan.getByText(m.decorPlan.quoteAlready)).toBeVisible();
  });

  test("catches a phone that is not a number before anything is sent", async ({
    page,
  }, testInfo) => {
    const m = testInfo.project.name === "mobile-ar" ? ar : en;
    const { approveCalls } = await openDesigner(page);

    // The share panel's approve opens the same dialog.
    const approve = page.getByRole("button", { name: m.visionPack.approveCta });
    await expect(approve).toBeVisible({ timeout: 45_000 });
    await approve.click();

    const dialog = page.getByRole("dialog");
    const phone = dialog.getByLabel(m.approveFlow.phoneLabel);
    await phone.fill("call my mum");
    await dialog.getByRole("button", { name: m.approveFlow.submit }).click();
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText(m.approveFlow.phoneInvalid)).toBeVisible();
    await expect(phone).toBeFocused();
    expect(approveCalls).toHaveLength(0);

    // "Not now" leaves without approving.
    await dialog.getByRole("button", { name: m.approveFlow.cancel }).click();
    await expect(dialog).toBeHidden();
    expect(approveCalls).toHaveLength(0);
  });
});

test.describe("email typo hint", () => {
  test("the enquiry form offers the address the couple meant", async ({ page }, testInfo) => {
    const isArabic = testInfo.project.name === "mobile-ar";
    const m = isArabic ? ar : en;
    const shots = process.env.APPROVE_FLOW_SHOTS;
    if (shots && isArabic) await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/enquire");
    // Contact details are the third step.
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: m.enquire.next }).click();
    }
    const email = page.getByLabel(m.enquire.emailLabel);
    await email.fill("name@2008gmail.com");

    const fix = page.getByRole("button", {
      name: m.emailTypo.apply.replace("{email}", "name2008@gmail.com"),
    });
    await expect(fix).toBeVisible();
    if (shots) {
      await email.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/email-typo-${testInfo.project.name}.png` });
    }
    await fix.click();
    await expect(email).toHaveValue("name2008@gmail.com");
    await expect(fix).toBeHidden();
  });
});
