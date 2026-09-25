import { randomUUID } from "node:crypto";
import { test, expect, type Page, type Route } from "@playwright/test";
import superjson from "superjson";

/**
 * F3, "Before we render", from the couple's side.
 *
 * The couple wrote notes for a garden and left the setting on indoor, and
 * one of their references is a photo of their own empty lawn: the two
 * things that cost the first real couples their free render. On the
 * generate step the card reads their choices back to them, a conflict
 * switches the setting in one tap (and the next read gets the new setting),
 * the lawn becomes their venue photo in one tap, and the render button
 * works the whole time. A failed check leaves no trace.
 *
 * `ai.checkIntake`, the design read and the promotion are answered by the
 * test, so nothing is spent and no design is written; what is under test
 * is the card in a real browser, in English on a desktop and Arabic on a
 * phone. The rules behind the answer are the router and unit tests' job
 * (tests/routers/ai-intake, tests/intake).
 *
 * INTAKE_SHOTS=<dir> also saves screenshots for a human look.
 */

type Handler = (input: unknown) => unknown;

const TRPC_PATH = /\/api\/trpc\/([^?]+)/;

class TrpcError {
  constructor(readonly message: string) {}
}

function decodeInputs(route: Route, url: URL): Record<string, { json?: unknown }> {
  const request = route.request();
  try {
    return request.method() === "GET"
      ? JSON.parse(url.searchParams.get("input") ?? "{}")
      : JSON.parse(request.postData() ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Answer the named procedures from the test. A batch that mixes them with
 * others goes to the server and only the named entries are replaced.
 */
async function mockTrpc(page: Page, handlers: Record<string, Handler>) {
  await page.route(TRPC_PATH, async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.match(TRPC_PATH)?.[1] ?? "").split(",");
    if (!procedures.some((p) => p in handlers)) return route.continue();
    const inputs = decodeInputs(route, url);
    let real: unknown[] = [];
    if (procedures.some((p) => !(p in handlers))) {
      const response = await route.fetch();
      const body = await response.json().catch(() => null);
      real = Array.isArray(body) ? body : [body];
    }
    const results = await Promise.all(
      procedures.map(async (procedure, i) => {
        if (!(procedure in handlers)) return real[i] ?? null;
        try {
          const data = await handlers[procedure](inputs[String(i)]?.json);
          return { result: { data: superjson.serialize(data) } };
        } catch (err) {
          if (!(err instanceof TrpcError)) throw err;
          return {
            error: superjson.serialize({
              message: err.message,
              code: -32603,
              data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
            }),
          };
        }
      }),
    );
    const failed = results.some((r) => r && typeof r === "object" && "error" in r);
    await route.fulfill({
      status: failed && procedures.length === 1 ? 500 : 200,
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.get("batch") === "1" ? results : results[0]),
    });
  });
}

// Local assets, so the images load without a network.
const LAWN_REF = {
  id: "upload:zaffa-references/e2e/lawn",
  url: "/home/venue/lawn-before.avif",
  source: "upload",
  sourceId: "zaffa-references/e2e/lawn",
};
const VIBE_REF = {
  id: "inspiration:e2e-vibe",
  url: "/home/venue/hall-after.avif",
  source: "inspiration",
  sourceId: "e2e-vibe",
};
const VENUE_PHOTO = {
  url: "/home/venue/lawn-before.avif",
  publicId: "zaffa-venues/e2e/lawn",
  width: 1400,
  height: 1050,
};

function designFixture(designId: string, guestCount: number | null) {
  return {
    id: designId,
    user_id: randomUUID(),
    event_id: null,
    name: "Garden wedding",
    event_type: "wedding",
    setting: "indoor",
    size: "medium",
    guest_count: guestCount,
    palette: { name: "Ivory and gold", colors: ["#fdf8f0", "#d4af37"] },
    references: {
      overall_vibe: [VIBE_REF],
      tables: [],
      flowers: [],
      lighting: [],
      venue_decor: [LAWN_REF],
    },
    style_notes: "Secret garden, chandeliers hanging from the trees, fairy lights",
    thumbnail: null,
    approved_at: null,
    venue_photo: null,
    selected_media_id: null,
    created_at: new Date("2026-09-20T10:00:00Z"),
    updated_at: new Date("2026-09-21T10:00:00Z"),
    media: [],
  };
}

interface CheckInput {
  setting: string;
  locale?: string;
  references: Array<{ url: string; category: string }>;
  hasVenuePhoto: boolean;
}

function answerFor(input: CheckInput) {
  const ar = input.locale === "ar";
  const lawnIndex = input.references.findIndex((r) => r.url === LAWN_REF.url);
  const indoor = input.setting === "indoor";
  return {
    summary: indoor
      ? ar
        ? "هنعملكم فرح لـ 180 مدعو بألوان العاجي والدهبي، ونجف متعلق في الشجر."
        : "A wedding for 180 guests in ivory and gold, with chandeliers hung in the trees."
      : ar
        ? "هنعملكم فرح في جنينة مفتوحة لـ 180 مدعو، ونجف متعلق في الشجر."
        : "An open-air garden wedding for 180 guests, with chandeliers hung in the trees.",
    briefEn: "Secret garden reception: crystal chandeliers hung in the trees, fairy lights.",
    conflicts: indoor
      ? [
          {
            kind: "setting",
            message: ar
              ? "كلامكم بيوصف جنينة، بس إنتوا مختارين داخلي."
              : "Your notes describe a garden, but the setting is indoor.",
            suggestedSetting: "outdoor",
          },
        ]
      : [],
    venueCandidateIndexes: !input.hasVenuePhoto && lawnIndex >= 0 ? [lawnIndex] : [],
    notesSetting: "outdoor",
  };
}

async function openGenerateStep(
  page: Page,
  {
    check,
    guestCount = 180,
    handlers = {},
  }: {
    check: (input: CheckInput) => unknown;
    guestCount?: number | null;
    /** Extra or replacement procedures, answered by the test. */
    handlers?: Record<string, Handler>;
  },
) {
  const designId = randomUUID();
  const checks: CheckInput[] = [];
  const promotions: Array<{ url: string }> = [];
  await mockTrpc(page, {
    "venueDesigns.getById": () => designFixture(designId, guestCount),
    // Nothing on this page should save a design the test invented.
    "venueDesigns.save": () => ({ id: designId }),
    "ai.checkIntake": async (input) => {
      checks.push(input as CheckInput);
      return check(input as CheckInput);
    },
    "venueDesigns.promoteReferenceToVenue": (input) => {
      promotions.push(input as { url: string });
      return VENUE_PHOTO;
    },
    ...handlers,
  });
  await page.goto(`/venue-designer/${designId}#step=generate`);
  return { checks, promotions };
}

async function isArabic(page: Page) {
  return (await page.locator("html").getAttribute("dir")) === "rtl";
}

test.describe("before we render", () => {
  test("a garden in the notes switches the setting in one tap, and the lawn becomes the venue", async ({
    page,
  }, testInfo) => {
    const shots = process.env.INTAKE_SHOTS;
    const phone = testInfo.project.name === "mobile-ar";
    if (shots && phone) await page.setViewportSize({ width: 390, height: 844 });

    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { checks, promotions } = await openGenerateStep(page, {
      check: async (input) => {
        if (checks.length === 1) await held;
        return answerFor(input);
      },
    });
    const arabic = await isArabic(page);

    // While the first read is on its way: a skeleton, and a button that
    // still works.
    const card = page.locator("[data-intake-card]");
    await expect(card).toBeVisible({ timeout: 45_000 });
    await expect(card.getByRole("status")).toBeVisible();
    await expect(page.locator("[data-generate-render]")).toBeEnabled();
    await expect.poll(() => checks.length).toBe(1);
    expect(checks[0]).toMatchObject({
      setting: "indoor",
      guestCount: 180,
      locale: arabic ? "ar" : "en",
      hasVenuePhoto: false,
    });
    release();

    await expect(card.locator("[data-intake-summary]")).toContainText(
      arabic ? "هنعملكم فرح لـ 180 مدعو" : "A wedding for 180 guests",
    );
    await expect(card.getByRole("heading")).toHaveText(
      arabic ? "ده اللي هنعمله لكم" : "Here's what we'll create",
    );
    const conflict = card.locator('[data-intake-conflict="setting"]');
    await expect(conflict).toContainText(
      arabic ? "كلامكم بيوصف جنينة" : "Your notes describe a garden",
    );
    const fix = conflict.locator('[data-intake-fix-setting="outdoor"]');
    await expect(fix).toHaveText(arabic ? "خلّوها خارجي" : "Switch to outdoor");
    const candidate = card.locator(`[data-intake-venue-candidate="${LAWN_REF.id}"]`);
    await expect(candidate).toBeVisible();
    // Only the couple's own upload is offered, not the library photo.
    await expect(card.locator("[data-intake-venue-candidate]")).toHaveCount(1);

    if (shots) {
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/intake-conflict-${testInfo.project.name}.png` });
    }

    // One tap: the setting flips, the conflict goes, the card says what
    // it did, and the next read is of the outdoor design.
    await fix.click();
    await expect(conflict).toHaveCount(0);
    await expect(card.locator("[data-intake-applied]")).toContainText(
      arabic ? "تمام، خلّيناها خارجي." : "Switched to outdoor.",
    );
    await expect.poll(() => checks.length).toBe(2);
    expect(checks[1]).toMatchObject({ setting: "outdoor" });
    await expect(card.locator("[data-intake-summary]")).toContainText(
      arabic ? "جنينة مفتوحة" : "open-air garden",
    );
    await expect(page.locator("[data-generate-render]")).toBeEnabled();

    // The lawn: their venue photo in one tap, and gone from the references.
    await candidate.locator("[data-intake-use-venue]").click();
    await expect.poll(() => promotions.length).toBe(1);
    expect(promotions[0]).toEqual({ url: LAWN_REF.url });
    await expect(page.locator("[data-venue-photo-summary]")).toBeVisible();
    await expect(card.locator("[data-intake-venue-candidate]")).toHaveCount(0);
    await expect(card.locator("[data-intake-applied]")).toContainText(
      arabic ? "تمام، هنزيّن صورة مكانكم." : "Done. We'll dress your venue photo.",
    );
    // And the next read knows there is a venue photo now.
    await expect.poll(() => checks.at(-1)?.hasVenuePhoto).toBe(true);

    if (shots) {
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/intake-fixed-${testInfo.project.name}.png` });
    }
  });

  test("a venue being set holds the render, and a render on its way holds the fixes", async ({
    page,
  }, testInfo) => {
    const shots = process.env.INTAKE_SHOTS;
    const phone = testInfo.project.name === "mobile-ar";
    if (shots && phone) await page.setViewportSize({ width: 390, height: 844 });

    let landVenue: () => void = () => {};
    const venueHeld = new Promise<void>((resolve) => (landVenue = resolve));
    let failRender: () => void = () => {};
    const renderHeld = new Promise<void>((resolve) => (failRender = resolve));
    const renders: Array<{ setting: string }> = [];
    await openGenerateStep(page, {
      check: answerFor,
      handlers: {
        "venueDesigns.promoteReferenceToVenue": async () => {
          await venueHeld;
          return VENUE_PHOTO;
        },
        // Held, then refused: nothing is rendered or spent.
        "ai.renderScene": async (input) => {
          renders.push(input as { setting: string });
          await renderHeld;
          throw new TrpcError("RENDER_FAILED");
        },
      },
    });
    const arabic = await isArabic(page);
    const card = page.locator("[data-intake-card]");
    const generate = page.locator("[data-generate-render]");
    await expect(card.locator("[data-intake-venue-candidate]")).toBeVisible({ timeout: 45_000 });

    // The lawn is being copied into their venue photo: the render waits
    // for it instead of leaving without the venue they just chose.
    await card.locator("[data-intake-use-venue]").click();
    await expect(generate).toBeDisabled();
    landVenue();
    await expect(page.locator("[data-venue-photo-summary]")).toBeVisible();
    await expect(generate).toBeEnabled();

    // Generate while the garden conflict still stands. That render left
    // with "indoor": the fix waits, and the card says why.
    const conflict = card.locator('[data-intake-conflict="setting"]');
    await expect(conflict).toBeVisible();
    await generate.click();
    await expect.poll(() => renders.length).toBe(1);
    expect(renders[0]).toMatchObject({ setting: "indoor" });
    const fix = conflict.locator('[data-intake-fix-setting="outdoor"]');
    await expect(fix).toBeDisabled();
    await expect(conflict.locator("[data-intake-keep]")).toBeDisabled();
    await expect(card.locator("[data-intake-locked]")).toHaveText(
      arabic
        ? "التصميم ده بيتعمل دلوقتي بالاختيارات اللي فوق. تقدروا تعملوا التعديلات دي في التصميم الجاي."
        : "This render is already on its way with the choices above. You can make these fixes for your next one.",
    );
    await expect(card.locator("[data-intake-applied]")).not.toContainText(
      arabic ? "خلّيناها خارجي" : "Switched to outdoor",
    );

    if (shots) {
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/intake-locked-${testInfo.project.name}.png` });
    }

    // It came back without a render: the fix is theirs again.
    failRender();
    await expect(fix).toBeEnabled();
    await expect(card.locator("[data-intake-locked]")).toHaveCount(0);
  });

  test("a missing guest count links back to basics", async ({ page }) => {
    await openGenerateStep(page, { check: answerFor, guestCount: null });
    const row = page.locator("[data-intake-guests-missing]");
    await expect(row).toBeVisible({ timeout: 45_000 });
    await row.getByRole("button").click();
    await expect(page).toHaveURL(/#step=basics$/);
  });

  test("a failed check leaves no card and a working button", async ({ page }) => {
    const { checks } = await openGenerateStep(page, {
      check: () => {
        throw new TrpcError("INTAKE_FAILED");
      },
    });
    await expect(page.locator("[data-generate-render]")).toBeVisible({ timeout: 45_000 });
    await expect.poll(() => checks.length).toBe(1);
    await expect(page.locator("[data-intake-card]")).toHaveCount(0);
    await expect(page.locator("[data-generate-render]")).toBeEnabled();
    await expect(page.getByText("INTAKE_FAILED")).toHaveCount(0);
  });
});
