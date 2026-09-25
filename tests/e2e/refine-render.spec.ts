import { randomUUID } from "node:crypto";
import { test, expect, type Page, type Route } from "@playwright/test";
import superjson from "superjson";

/**
 * F2, "Talk to your design", from the couple's side.
 *
 *  1. An anonymous visitor with a render sees the email gate and nothing
 *     else: no change box, no versions. The render is only shown past the
 *     gate, so talking to it is too.
 *  2. A couple who can see their render opens it from the versions, fills
 *     the box from a suggestion, sends it, and gets the new version on
 *     screen with the confirmation, the changes left and a longer strip.
 *  3. A change the server refuses reads as the couple's words, not ours.
 *
 * The designer only shows a render (and so the change box) to a visitor the
 * browser does not see as anonymous. These public projects have no signed-in
 * account, since they run against production data where only anonymous
 * users may be created, so cases 2 and 3 drop the session cookie the
 * middleware mints on the page load and answer every procedure the panel
 * reads from the test. What is under test is the panel, in a real browser,
 * in English on a desktop and Arabic on a phone; ownership, the email gate
 * and the quota are the router tests' job (tests/routers/ai-refine).
 *
 * REFINE_SHOTS=<dir> also saves screenshots for a human look.
 */

type Handler = (input: unknown) => unknown;

const TRPC_PATH = /\/api\/trpc\/([^?]+)/;

// tRPC's JSON-RPC codes for the errors these cases answer with.
const ERROR_CODES: Record<string, number> = {
  BAD_REQUEST: -32600,
  FORBIDDEN: -32003,
};

class TrpcError {
  constructor(
    readonly code: keyof typeof ERROR_CODES,
    readonly message: string,
  ) {}
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
        const input = inputs[String(i)]?.json;
        try {
          const data = await handlers[procedure](input);
          return { result: { data: superjson.serialize(data) } };
        } catch (err) {
          if (!(err instanceof TrpcError)) throw err;
          return {
            error: superjson.serialize({
              message: err.message,
              code: ERROR_CODES[err.code],
              data: { code: err.code, httpStatus: err.code === "FORBIDDEN" ? 403 : 400 },
            }),
          };
        }
      }),
    );
    const failed = results.some((r) => r && typeof r === "object" && "error" in r);
    await route.fulfill({
      status: failed && procedures.length === 1 ? 400 : 200,
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.get("batch") === "1" ? results : results[0]),
    });
  });
}

/** Load the page without keeping the anonymous session it mints. */
async function withoutSession(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith("/venue-designer/"),
    async (route) => {
      if (route.request().resourceType() !== "document") return route.continue();
      const response = await route.fetch();
      // `route.fetch` shares the context's cookie jar, so the session the
      // middleware just minted is already in it: take it back out, and keep
      // it out of the page's own response too.
      await page.context().clearCookies({ name: /^sb-/ });
      const headers = { ...response.headers() };
      delete headers["set-cookie"];
      await route.fulfill({ response, headers });
    },
  );
}

// Local assets, so the images load without a network: the empty hall as
// the first render and the dressed hall as the change.
const ORIGINAL_URL = "/home/venue/hall-before.avif";
const CHANGED_URL = "/home/venue/hall-after.avif";

interface Row {
  id: string;
  design_id: string;
  parent_id: string | null;
  type: string;
  url: string;
  created_at: Date;
  meta: {
    mode: "generate" | "refine";
    instructionRaw: string | null;
    confirmation: string | null;
    venuePublicId: null;
  };
}

function designFixture(designId: string, media: Row[]) {
  return {
    id: designId,
    user_id: randomUUID(),
    event_id: null,
    name: "Hall reception",
    event_type: "wedding",
    setting: "indoor",
    size: "large",
    guest_count: 250,
    palette: { name: "Ivory and gold", colors: ["#fdf8f0", "#d4af37"] },
    references: { overall_vibe: [], tables: [], flowers: [], lighting: [], venue_decor: [] },
    style_notes: "",
    thumbnail: null,
    approved_at: null,
    venue_photo: null,
    selected_media_id: null,
    created_at: new Date("2026-09-20T10:00:00Z"),
    updated_at: new Date("2026-09-21T10:00:00Z"),
    // Newest first, as getById returns it.
    media: [...media].reverse(),
  };
}

async function openDesigner(
  page: Page,
  refine: (input: { mediaId: string; instruction: string; locale?: string }) => unknown,
) {
  const designId = randomUUID();
  const renderId = randomUUID();
  const media: Row[] = [
    {
      id: renderId,
      design_id: designId,
      parent_id: null,
      type: "render",
      url: ORIGINAL_URL,
      created_at: new Date("2026-09-21T10:00:00Z"),
      meta: { mode: "generate", instructionRaw: null, confirmation: null, venuePublicId: null },
    },
  ];
  const refineCalls: Array<{ mediaId: string; instruction: string; locale?: string }> = [];

  await mockTrpc(page, {
    "venueDesigns.getById": () => designFixture(designId, media),
    // Nothing on this page should save a design the test invented.
    "venueDesigns.save": () => ({ id: designId }),
    "ai.refineRender": async (input) => {
      const call = input as { mediaId: string; instruction: string; locale?: string };
      refineCalls.push(call);
      const result = await refine(call);
      const answer = result as { mediaId: string; confirmation: string | null };
      // Like the server: the new version is on the design from now on.
      media.push({
        id: answer.mediaId,
        design_id: designId,
        parent_id: call.mediaId,
        type: "render",
        url: CHANGED_URL,
        created_at: new Date(),
        meta: {
          mode: "refine",
          instructionRaw: call.instruction,
          confirmation: answer.confirmation,
          venuePublicId: null,
        },
      });
      return result;
    },
  });

  await page.goto(`/venue-designer/${designId}#step=generate`);
  return { designId, renderId, refineCalls };
}

async function isArabic(page: Page) {
  return (await page.locator("html").getAttribute("dir")) === "rtl";
}

test.describe("talk to your design", () => {
  test("an anonymous visitor gets the email gate, not the change box", async ({ page }) => {
    await openDesigner(page, () => {
      throw new Error("no change should be sent");
    });
    await expect(page.locator("#email-gate-input")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("[data-refine-box]")).toHaveCount(0);
    await expect(page.locator("[data-version-strip]")).toHaveCount(0);
  });

  test("a suggestion fills the box, and the change lands as a new version", async ({
    page,
  }, testInfo) => {
    const shots = process.env.REFINE_SHOTS;
    const phone = testInfo.project.name === "mobile-ar";
    if (shots && phone) await page.setViewportSize({ width: 390, height: 844 });

    await withoutSession(page);
    const newId = randomUUID();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { renderId, refineCalls } = await openDesigner(page, async ({ locale }) => {
      await held;
      return {
        mediaId: newId,
        parentId: renderId,
        imageUrl: CHANGED_URL,
        confirmation:
          locale === "ar"
            ? "تمام، زوّدنالكم الورد على الترابيزات وحوالين الكوشة."
            : "Done: we added more flowers along the tables and around the stage.",
        editsLeft: 2,
      };
    });
    const arabic = await isArabic(page);

    // Coming back to the generate step, the render is a version to open.
    const strip = page.locator("[data-version-strip]");
    await expect(strip).toBeVisible({ timeout: 45_000 });
    await strip.locator(`[data-version-id="${renderId}"] button`).first().click();

    const box = page.locator("[data-refine-box]");
    await expect(box).toBeVisible();
    await expect(box.locator("label")).toHaveText(
      arabic ? "عايزين تغيّروا إيه؟" : "What would you change?",
    );
    const input = box.locator("[data-refine-input]");
    await expect(input).toHaveAttribute("dir", "auto");

    // A suggestion fills the box; it does not send.
    const chip = box.locator("[data-refine-chip]").first();
    const chipText = ((await chip.textContent()) ?? "").trim();
    expect(chipText).toBe(arabic ? "ورد أكتر" : "More flowers");
    await chip.click();
    await expect(input).toHaveValue(chipText);
    expect(refineCalls).toHaveLength(0);

    if (shots) {
      await box.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/refine-box-${testInfo.project.name}.png` });
    }

    await box.locator("[data-refine-send]").click();
    // While it works: the calm line, and the version on screen under a veil.
    await expect(box.locator("[data-refine-pending]")).toBeVisible();
    await expect(page.locator("[data-refine-veil]")).toBeVisible();
    await expect.poll(() => refineCalls.length).toBe(1);
    expect(refineCalls[0]).toMatchObject({
      mediaId: renderId,
      instruction: chipText,
      locale: arabic ? "ar" : "en",
    });
    if (shots) {
      await page.screenshot({ path: `${shots}/refine-pending-${testInfo.project.name}.png` });
    }
    release();

    // Landed: the confirmation, the changes left, and a strip of two with
    // the new version on screen, captioned with what was asked.
    await expect(box.locator("[data-refine-confirmation]")).toContainText(
      arabic ? "تمام، زوّدنالكم الورد" : "Done: we added more flowers",
    );
    // Arabic has a dual: two changes is its own word, not "2".
    await expect(box.locator("[data-refine-edits-left]")).toHaveText(
      arabic ? "فاضل تغييرين" : "2 changes left",
    );
    await expect(input).toHaveValue("");
    await expect(strip.locator("[data-version-id]")).toHaveCount(2);
    const active = strip.locator("[data-version-active]");
    await expect(active).toHaveAttribute("data-version-id", newId);
    await expect(active).toContainText(arabic ? "تغيير 1" : "Change 1");
    await expect(active).toContainText(chipText);
    await expect(page.locator("[data-refine-veil]")).toHaveCount(0);

    if (shots) {
      await strip.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${shots}/refine-landed-${testInfo.project.name}.png`,
        fullPage: false,
      });
    }

    // The original is one tap away, and the next change would apply to it.
    await strip.locator(`[data-version-id="${renderId}"] button`).first().click();
    await expect(strip.locator("[data-version-active]")).toHaveAttribute(
      "data-version-id",
      renderId,
    );
    await expect(box.locator("[data-refine-confirmation]")).toHaveCount(0);
  });

  test("a refused change says what we can change, in the couple's words", async ({ page }) => {
    await withoutSession(page);
    const { renderId } = await openDesigner(page, () => {
      throw new TrpcError("BAD_REQUEST", "REFINE_REJECTED");
    });
    const arabic = await isArabic(page);
    const strip = page.locator("[data-version-strip]");
    await expect(strip).toBeVisible({ timeout: 45_000 });
    await strip.locator(`[data-version-id="${renderId}"] button`).first().click();

    const box = page.locator("[data-refine-box]");
    const input = box.locator("[data-refine-input]");
    await input.fill(arabic ? "حطوا العروسة في النص" : "put the bride in the middle");
    await input.press("Enter");
    const alert = box.getByRole("alert");
    await expect(alert).toContainText(
      arabic ? "بنغيّر الديكور والإضاءة" : "We can only change the decor, lighting and layout",
    );
    await expect(alert).not.toContainText("REFINE_REJECTED");
    // What they typed is still there to rework.
    await expect(input).not.toHaveValue("");
  });
});
