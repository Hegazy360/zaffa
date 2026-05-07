/**
 * Pack path — the second critical flow E2E that protects the Wedding
 * Vision Pack revenue lane:
 *
 *   1. A signed-in client kicks off Vision Pack checkout from the
 *      designer paywall and submits the Stripe test card.
 *   2. The webhook flips the VisionPack row to `active` with a unique
 *      microsite slug.
 *   3. The welcome page polls `visionPacks.current`, sees `active`, and
 *      auto-redirects into the designer.
 *   4. The recipient toggles the microsite public from settings — this
 *      stamps `microsite_published_at` (the refund tripwire), and the
 *      public `/v/<slug>` route renders without auth.
 *
 * AI generation itself is NOT exercised here — it requires real OpenAI
 * keys and is covered by router-level Vitest specs against the
 * `requireActivePack` / `consumeQuota` helpers. This spec proves the
 * money-flow + microsite-publish surface of the pack lane end-to-end.
 *
 * Runs serial so `packId` / `slug` flow through tests via the shared
 * ctx object, mirroring `money-path.spec.ts`.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import {
  closeTestDb,
  getVisionPackByRecipient,
  getVisionPackById,
} from "./helpers/db";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const CLIENT_STATE = path.join(AUTH_DIR, "client.json");

test.describe.configure({ mode: "serial" });

const ctx: {
  packId: string;
  slug: string;
  clientUserId: string;
} = {
  packId: "",
  slug: "",
  clientUserId: "",
};

test.describe("pack path: pay → activate → publish microsite", () => {
  test.afterAll(async () => {
    await closeTestDb();
  });

  test("client buys a Vision Pack via Stripe Checkout", async ({ browser }) => {
    // Stripe checkout + webhook round-trip — match the money-path budget.
    test.setTimeout(180_000);

    const browserCtx = await browser.newContext({ storageState: CLIENT_STATE });
    const page = await browserCtx.newPage();
    try {
      await test.step("trigger pack checkout from the venue-designer marketing surface", async () => {
        await page.goto("/venue-designer");
        // The marketing hero (shown to signed-in users without a pack)
        // exposes the buy CTA. The first matching button starts checkout.
        const buyCta = page
          .getByRole("button", { name: /unlock|create.*vision|get yours|buy/i })
          .first();
        await buyCta.waitFor({ state: "visible", timeout: 15_000 });
        await buyCta.click();
        await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });
      });

      await test.step("submit the Stripe test card", async () => {
        await page
          .getByTestId("hosted-payment-submit-button")
          .waitFor({ state: "visible", timeout: 45_000 });

        const email = page
          .locator('input[type="email"], input[name="email"]')
          .first();
        await email.waitFor({ state: "visible", timeout: 15_000 });
        await email.click();
        await email.pressSequentially("e2e+pack@test.zaffa", { delay: 15 });
        await expect(email).toHaveValue("e2e+pack@test.zaffa");

        await page.getByLabel(/card number/i).fill("4242424242424242");
        await page
          .getByLabel(/expiration|expiry/i)
          .first()
          .fill("12 / 34");
        await page.getByLabel(/cvc/i).first().fill("123");

        const nameOnCard = page
          .locator(
            'input[name="billingName"], input[placeholder*="Full name" i]',
          )
          .first();
        if (await nameOnCard.isVisible().catch(() => false)) {
          await nameOnCard.click();
          await nameOnCard.pressSequentially("Pack Tester", { delay: 15 });
        }

        const postal = page.getByLabel(/zip|postal/i).first();
        if (await postal.isVisible().catch(() => false)) {
          await postal.fill("10000");
        }

        const saveInfo = page
          .getByRole("checkbox", { name: /save my information/i })
          .first();
        if (await saveInfo.isChecked().catch(() => false)) {
          await saveInfo.uncheck({ force: true });
        }

        await page.getByTestId("hosted-payment-submit-button").click();
        await page.waitForURL((url) => !url.host.endsWith("stripe.com"), {
          timeout: 60_000,
        });
      });

      await test.step("DB shows the pack flipped to active with a microsite slug", async () => {
        await expect
          .poll(
            async () => {
              const pack = await getVisionPackByRecipient(
                process.env.E2E_CLIENT_EMAIL ?? "client@test.zaffa",
              );
              return pack?.status ?? null;
            },
            {
              message: "webhook should activate the Vision Pack row",
              timeout: 60_000,
              intervals: [500, 1000, 2000, 2500],
            },
          )
          .toBe("active");

        const pack = await getVisionPackByRecipient(
          process.env.E2E_CLIENT_EMAIL ?? "client@test.zaffa",
        );
        expect(pack, "pack row exists").not.toBeNull();
        expect(pack!.micrositeSlug, "microsite slug is generated").toBeTruthy();
        ctx.packId = pack!.id;
        ctx.slug = pack!.micrositeSlug!;
      });
    } finally {
      await browserCtx.close();
    }
  });

  test("welcome page redirects to the designer once the pack is live", async ({
    browser,
  }) => {
    expect(ctx.packId).toBeTruthy();
    const browserCtx = await browser.newContext({ storageState: CLIENT_STATE });
    const page = await browserCtx.newPage();
    try {
      await page.goto(`/venue-designer/welcome?pack=${ctx.packId}`);
      // The welcome page polls every 1.5s and redirects to /venue-designer
      // (or the requested return path) once status === "active".
      await page.waitForURL(/\/venue-designer($|\/|\?)/, { timeout: 30_000 });
    } finally {
      await browserCtx.close();
    }
  });

  test("recipient flips microsite public + the public route renders unauthenticated", async ({
    browser,
  }) => {
    expect(ctx.slug).toBeTruthy();

    const browserCtx = await browser.newContext({ storageState: CLIENT_STATE });
    const page = await browserCtx.newPage();
    try {
      await test.step("toggle microsite public from settings", async () => {
        await page.goto("/dashboard/client/settings");
        // The microsite card has a Public/Private toggle button with one
        // of those two literal labels. Click whichever one moves us to
        // "Public" (idempotent — already public still passes).
        const toggle = page
          .getByRole("button", { name: /^(public|private)$/i })
          .first();
        await toggle.waitFor({ state: "visible", timeout: 15_000 });
        const label = (await toggle.textContent())?.trim().toLowerCase();
        if (label === "private") {
          await toggle.click();
        }

        await expect
          .poll(
            async () => {
              const pack = await getVisionPackById(ctx.packId);
              return pack?.micrositePublic ?? null;
            },
            { timeout: 15_000 },
          )
          .toBe(true);

        const pack = await getVisionPackById(ctx.packId);
        expect(pack!.micrositePublishedAt).not.toBeNull();
      });

      await test.step("public /v/<slug> renders without auth", async () => {
        // Strip the auth state for this assertion.
        const anon = await browser.newContext();
        const anonPage = await anon.newPage();
        try {
          const res = await anonPage.goto(`/v/${ctx.slug}`);
          expect(res?.status(), "anonymous fetch returns 200").toBe(200);
          // Some recognizable Vision Pack copy on the public page —
          // pick something stable (the "Create your" CTA copy).
          await expect(anonPage.locator("body")).toContainText(/create/i, {
            timeout: 15_000,
          });
        } finally {
          await anon.close();
        }
      });
    } finally {
      await browserCtx.close();
    }
  });
});
