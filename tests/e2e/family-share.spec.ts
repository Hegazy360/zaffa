import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes, randomUUID } from "node:crypto";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { mockTrpc } from "./helpers/trpc-mock";

/**
 * F6, "Ask your family": the couple makes a private link in the share panel
 * and sends it on WhatsApp; family open `/s/<token>`, give a first name once
 * and tap the heart on the version they love.
 *
 * The matrix runs signed out against a database that must never get test
 * rows, so no share exists for the token these tests invent: the page reads
 * the database, finds nothing, asks `designShares.getByToken` once, and that
 * call (with `vote`, and the couple's side) is answered here. Everything a
 * visitor sees and does on the page is real.
 */

const EASTERN_ARABIC_DIGITS = /[٠-٩]/;

function newToken(): string {
  return randomBytes(16).toString("base64url");
}

async function openSharePage(page: Page, opts: { gone?: boolean } = {}) {
  const token = newToken();
  const first = randomUUID();
  const second = randomUUID();
  const votes: Array<Record<string, unknown>> = [];

  await mockTrpc(page, {
    "designShares.getByToken": (input) => {
      expect((input as { token?: string }).token).toBe(token);
      if (opts.gone) throw { code: "NOT_FOUND" };
      return {
        coupleName: "Noor",
        designName: "Garden nikah",
        versions: [
          { id: first, number: 1, url: "/home/examples/collage-2.avif", caption: null },
          {
            id: second,
            number: 2,
            url: "/home/examples/hero.avif",
            caption: "ورد أكتر على الكوشة",
          },
        ],
      };
    },
    "designShares.vote": (input) => {
      votes.push(input as Record<string, unknown>);
      return { ok: true, mediaId: (input as { mediaId: string }).mediaId };
    },
  });

  await page.goto(`/s/${token}`);
  return { token, first, second, votes };
}

test.describe("family vote page", () => {
  test("asks a first name once, records the pick, and lets them change their mind", async ({
    page,
  }, testInfo) => {
    const isArabic = testInfo.project.name === "mobile-ar";
    const m = (isArabic ? ar : en).familyShare;
    const shots = process.env.FAMILY_SHARE_SHOTS;
    // Screenshots are looked at on the phone size the audience uses.
    if (shots && isArabic) await page.setViewportSize({ width: 390, height: 844 });

    const { first, second, votes } = await openSharePage(page);

    await expect(page.locator("html")).toHaveAttribute("dir", isArabic ? "rtl" : "ltr");
    await expect(
      page.getByRole("heading", { level: 1, name: m.pageTitleNamed.replace("{name}", "Noor") }),
    ).toBeVisible({ timeout: 45_000 });
    // Never indexed: the link is the permission.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const cards = page.getByTestId("family-version");
    await expect(cards).toHaveCount(2);
    // The couple's own words under the version they came from.
    await expect(cards.nth(1)).toContainText("ورد أكتر على الكوشة");
    if (isArabic) {
      // Counts that are not money read in the Arabic numerals of the copy.
      await expect(cards.nth(1)).toContainText(EASTERN_ARABIC_DIGITS);
    }

    if (shots) {
      await page.screenshot({ path: `${shots}/family-page-${testInfo.project.name}.png` });
    }

    // First heart: who are you?
    await cards.nth(1).getByRole("button", { name: m.voteCta }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(m.nameTitle)).toBeVisible();
    await dialog.getByRole("button", { name: m.submitVote }).click();
    await expect(dialog.getByText(m.nameRequired)).toBeVisible();
    expect(votes).toHaveLength(0);

    await dialog.getByLabel(m.nameLabel).fill(isArabic ? "منى" : "Mona");
    await dialog.getByLabel(m.noteLabel).fill(isArabic ? "الورد تحفة" : "Love the flowers");
    if (shots) {
      await page.screenshot({ path: `${shots}/family-dialog-${testInfo.project.name}.png` });
    }
    await dialog.getByRole("button", { name: m.submitVote }).click();
    await expect(dialog).toBeHidden();

    expect(votes).toHaveLength(1);
    expect(votes[0]).toMatchObject({
      mediaId: second,
      voterName: isArabic ? "منى" : "Mona",
      comment: isArabic ? "الورد تحفة" : "Love the flowers",
    });
    const voterKey = votes[0].voterKey as string;
    expect(voterKey).toMatch(/^[0-9a-f-]{36}$/);

    await expect(cards.nth(1).getByRole("button", { name: m.votedBadge })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const status = page.getByTestId("family-chosen");
    await expect(status).toBeVisible();
    await expect(status).toContainText(isArabic ? "٢" : "2");

    if (shots) {
      await page.screenshot({ path: `${shots}/family-voted-${testInfo.project.name}.png` });
      // Let the thank-you toast go, it sits over the card's footer.
      await expect(page.getByText(m.voteSaved)).toBeHidden({ timeout: 15_000 });
      await cards.nth(1).evaluate((el) => el.scrollIntoView({ block: "end" }));
      await page.screenshot({ path: `${shots}/family-voted-card-${testInfo.project.name}.png` });
    }
    // The pick carries its note, editable (one was left with the vote).
    await expect(cards.nth(1).getByRole("button", { name: m.editNote })).toBeVisible();

    // Changing their mind: no second name prompt, same voter, note dropped.
    await cards.nth(0).getByRole("button", { name: m.voteCta }).click();
    await expect(cards.nth(0).getByRole("button", { name: m.votedBadge })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(dialog).toBeHidden();
    expect(votes).toHaveLength(2);
    expect(votes[1]).toMatchObject({ mediaId: first, voterKey });
    // No note carried over (superjson may put an explicit null on the wire).
    expect(votes[1].comment ?? undefined).toBeUndefined();
    await expect(status).toContainText(isArabic ? "١" : "1");

    // The pick survives a reload, from this browser's own storage.
    await page.reload();
    await expect(
      page.getByTestId("family-version").nth(0).getByRole("button", { name: m.votedBadge }),
    ).toBeVisible({ timeout: 45_000 });

    // The way back to the studio is tagged, so the loop can be measured.
    const cta = page.getByRole("link", { name: m.footerCta });
    await expect(cta).toHaveAttribute("href", "/?utm_source=family_share");
  });

  test("a revoked or unknown link says so, and still offers the studio", async ({ page }, testInfo) => {
    const m = (testInfo.project.name === "mobile-ar" ? ar : en).familyShare;
    await openSharePage(page, { gone: true });
    await expect(page.getByTestId("family-gone")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("heading", { level: 1, name: m.goneTitle })).toBeVisible();
    await expect(page.getByRole("link", { name: m.footerCta })).toBeVisible();
    await expect(page.getByTestId("family-version")).toHaveCount(0);
    const shots = process.env.FAMILY_SHARE_SHOTS;
    if (shots) {
      await page.screenshot({ path: `${shots}/family-gone-${testInfo.project.name}.png` });
    }
  });
});

test.describe("family vote page, accessibility", () => {
  // Same bar as axe.spec.ts: serious and critical only, motion settled so
  // contrast is measured on the real background.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("has no serious or critical violations, before and after a vote", async ({ page }, testInfo) => {
    const m = (testInfo.project.name === "mobile-ar" ? ar : en).familyShare;
    await openSharePage(page);
    const cards = page.getByTestId("family-version");
    await expect(cards).toHaveCount(2, { timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);

    const audit = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // The dev server's own overlay button is not part of the page.
        .exclude("nextjs-portal")
        .analyze();
      return results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    };
    expect(await audit()).toEqual([]);

    await cards.nth(0).getByRole("button", { name: m.voteCta }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await audit()).toEqual([]);
  });
});

test.describe("ask your family, in the designer", () => {
  test("creates the link, shares it on WhatsApp and shows who picked what", async ({
    page,
  }, testInfo) => {
    const isArabic = testInfo.project.name === "mobile-ar";
    const m = (isArabic ? ar : en).familyShare;
    const shots = process.env.FAMILY_SHARE_SHOTS;
    if (shots && isArabic) await page.setViewportSize({ width: 390, height: 844 });

    const designId = randomUUID();
    const older = randomUUID();
    const newer = randomUUID();
    const token = newToken();
    let created = false;
    const createCalls: unknown[] = [];

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
        palette: { name: "White and gold", colors: ["#ffffff", "#d4af37", "#f4ede1"] },
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
            id: newer,
            design_id: designId,
            parent_id: older,
            type: "render",
            url: "/home/examples/hero.avif",
            created_at: new Date("2026-09-21T10:00:00Z"),
            meta: { mode: "refine", instructionRaw: "more candles", confirmation: null },
          },
          {
            id: older,
            design_id: designId,
            parent_id: null,
            type: "render",
            url: "/home/examples/collage-2.avif",
            created_at: new Date("2026-09-20T10:00:00Z"),
            meta: { mode: "generate", instructionRaw: null, confirmation: null },
          },
        ],
      }),
      "venueDesigns.save": () => ({ id: designId }),
      "visionPacks.current": () => ({
        id: randomUUID(),
        sku: "wedding_free_taste_v1",
        status: "active",
        event_id: null,
        microsite_slug: null,
        microsite_published_at: null,
        microsite_public: false,
      }),
      // Not under test here; answered so nothing reaches a real procedure.
      "decorPlan.forMedia": () => {
        throw { code: "NOT_FOUND" };
      },
      "designShares.forOwner": () =>
        created
          ? {
              needsEmail: false,
              share: { token, path: `/s/${token}`, createdAt: new Date() },
              votes: [
                {
                  mediaId: newer,
                  number: 2,
                  count: 2,
                  voters: [
                    { name: "Mona", comment: "Love the candles", at: new Date() },
                    { name: "Karim", comment: null, at: new Date() },
                  ],
                },
                {
                  mediaId: older,
                  number: 1,
                  count: 1,
                  voters: [{ name: "Hala", comment: null, at: new Date() }],
                },
              ],
              voterCount: 3,
            }
          : { needsEmail: false, share: null, votes: [], voterCount: 0 },
      "designShares.create": (input) => {
        createCalls.push(input);
        created = true;
        return { token, path: `/s/${token}`, created: true };
      },
    });

    await page.goto(`/venue-designer/${designId}#step=generate`);

    const block = page.getByTestId("family-share");
    await expect(block).toBeVisible({ timeout: 45_000 });
    await expect(block.getByText(m.blockTitle)).toBeVisible();

    await block.getByRole("button", { name: m.createCta }).click();

    const url = block.getByTestId("family-share-url");
    await expect(url).toContainText(`/s/${token}`);
    expect(createCalls).toEqual([{ designId }]);
    // A link reads left to right, even inside the Arabic page.
    await expect(url).toHaveAttribute("dir", "ltr");

    const whatsapp = block.getByTestId("family-share-whatsapp");
    const href = (await whatsapp.getAttribute("href")) ?? "";
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(href.slice("https://wa.me/?text=".length));
    expect(text).toContain(`/s/${token}`);
    expect(text).toContain(m.whatsappMessage.split("{url}")[0].trim());

    const results = block.getByTestId("family-result");
    await expect(results).toHaveCount(2);
    await expect(results.nth(0)).toContainText("Mona");
    await expect(results.nth(0)).toContainText("Love the candles");
    await expect(results.nth(0)).toContainText(m.topPick);
    if (isArabic) await expect(results.nth(0)).toContainText(EASTERN_ARABIC_DIGITS);

    if (shots) {
      await block.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/family-designer-${testInfo.project.name}.png` });
    }
  });
});
