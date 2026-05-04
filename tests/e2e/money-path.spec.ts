/**
 * Money path — the single critical-flow E2E that protects Zaffa's revenue
 * pipeline end-to-end:
 *
 *   1. Client approves a venue design and gets a real event
 *   2. Planner discovers it on the marketplace and sends a proposal with
 *      a two-installment schedule
 *   3. Client accepts the plan, pays the deposit through Stripe Checkout
 *      (test mode, card 4242 4242 4242 4242), and the webhook flips the
 *      payment row to `paid`
 *   4. Admin records the off-Stripe payout to the planner
 *
 * Everything runs in one worker, serial mode, so `eventId` / `installmentId`
 * / `plannerUserId` can flow between tests through a module-scoped object.
 * Each test constructs its own browser context from the pre-baked
 * storageState json for the role it is acting as (see auth.setup.ts).
 *
 * The Stripe step uses a DB-truth wait (`expect.poll` on `payment.status`)
 * BEFORE asserting the UI "Paid" badge, because the UI polls at 2.5s and
 * Stripe CLI forwarding adds latency. That sequence means a webhook mis-fire
 * fails fast at the DB assertion rather than timing out 60s later on a UI
 * selector.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import {
  closeTestDb,
  getE2EPlannerProfileId,
  getPaymentStatus,
  getPayoutForInstallment,
  getProposalSnapshot,
  getScheduleStatus,
} from "./helpers/db";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const CLIENT_STATE = path.join(AUTH_DIR, "client.json");
const PLANNER_STATE = path.join(AUTH_DIR, "planner.json");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");

test.describe.configure({ mode: "serial" });

// Shared state across the four serial tests. Populated as the flow progresses.
const ctx: {
  designName: string;
  coverLetter: string;
  eventId: string;
  depositInstallmentId: string;
  plannerProfileId: string;
} = {
  designName: "",
  coverLetter: "",
  eventId: "",
  depositInstallmentId: "",
  plannerProfileId: "",
};

test.describe("money path: design → proposal → stripe pay → admin payout", () => {
  test.beforeAll(async () => {
    const stamp = Date.now();
    ctx.designName = `Playwright Wedding ${stamp}`;
    ctx.coverLetter =
      "E2E cover letter — Playwright-generated proposal for the money-path suite. " +
      `Run stamp ${stamp}. Covers venue styling, coordination, and day-of support.`;

    // Cache the planner's PlannerProfile.id so the admin payout step can
    // scope queries without racing against other planners in the DB.
    ctx.plannerProfileId = await getE2EPlannerProfileId();
  });

  test.afterAll(async () => {
    await closeTestDb();
  });

  test("client creates an event by approving a design", async ({ browser }) => {
    const browserCtx = await browser.newContext({ storageState: CLIENT_STATE });
    const page = await browserCtx.newPage();
    try {
      await test.step("open client dashboard and enter the venue designer", async () => {
        await page.goto("/dashboard/client");
        // The CTA is a Base UI <Button render={<Link />}> so it renders as an
        // anchor. `getByRole('link', ...)` is the stable target. If the empty
        // state is showing instead, the "Create your first design" link has a
        // different label; fall back by href.
        const startLink = page.getByRole("link", {
          name: /start a new design/i,
        });
        if (await startLink.isVisible().catch(() => false)) {
          await startLink.click();
        } else {
          await page
            .locator('a[href="/venue-designer/new"]')
            .first()
            .click();
        }
        // Next.js dev-mode first compile on CI's runners is slow (~5-10s),
        // so give this navigation a comfortable 45s ceiling.
        await page.waitForURL(/\/venue-designer\/new/, { timeout: 45_000 });
      });

      await test.step("rename the design so it becomes dirty, then save", async () => {
        const nameInput = page.getByPlaceholder(/design name/i);
        await nameInput.waitFor({ state: "visible", timeout: 15_000 });
        await nameInput.fill(ctx.designName);
        // Blur so the onChange handler propagates synchronously before we
        // click Save — avoids a race where the first save POST ships with
        // the stale default name.
        await nameInput.press("Tab");

        const saveBtn = page.getByRole("button", { name: /^save$/i });
        await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
        await saveBtn.click();
        // `venueDesigns.save` replaces the URL with the new id on success.
        await page.waitForURL(/\/venue-designer\/[0-9a-f-]{36}/i, {
          timeout: 20_000,
        });
      });

      await test.step("approve the design to create a real event", async () => {
        const approveBtn = page.getByRole("button", {
          name: /approve.*create event/i,
        });
        await approveBtn.waitFor({ state: "visible", timeout: 10_000 });
        await approveBtn.click();
        await page.waitForURL(
          /\/dashboard\/client\/event\/[0-9a-f-]{36}/i,
          { timeout: 20_000 },
        );
        const match = page.url().match(/\/event\/([0-9a-f-]{36})/i);
        expect(match, "eventId should be in the URL").not.toBeNull();
        ctx.eventId = match![1];
      });

      await test.step("event page surfaces the design name as its title", async () => {
        // Design name appears in both the page h1 and the linked design card
        // (h3). Pin to the page-level h1 to avoid strict-mode collisions.
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: new RegExp(ctx.designName, "i"),
          }),
        ).toBeVisible({ timeout: 10_000 });
      });
    } finally {
      await browserCtx.close();
    }
  });

  test("planner sends a proposal with a 50/50 payment plan", async ({
    browser,
  }) => {
    expect(ctx.eventId, "test 1 must have populated eventId").toBeTruthy();
    const browserCtx = await browser.newContext({ storageState: PLANNER_STATE });
    const page = await browserCtx.newPage();
    try {
      await test.step("open the marketplace and pick the brief we just created", async () => {
        await page.goto("/dashboard/planner/marketplace");
        // Cards link to /dashboard/planner/marketplace/<eventId> — targeting by
        // href avoids matching on the design title (which might appear in two
        // places on the page, e.g. recent + filtered).
        const card = page.locator(
          `a[href*="/dashboard/planner/marketplace/${ctx.eventId}"]`,
        );
        await card.first().waitFor({ state: "visible", timeout: 15_000 });
        await card.first().click();
        await page.waitForURL(
          new RegExp(`/dashboard/planner/marketplace/${ctx.eventId}`),
          { timeout: 15_000 },
        );
      });

      await test.step("open the proposal dialog and submit a 50/50 plan", async () => {
        await page
          .getByRole("button", { name: /write a proposal/i })
          .click();

        // The dialog title is "Propose for {title}" — wait for a known form
        // field rather than the title so we don't couple to the locale.
        const coverField = page.locator("#cover");
        await coverField.waitFor({ state: "visible", timeout: 10_000 });
        await coverField.fill(ctx.coverLetter);

        const quoteField = page.locator("#quote");
        await quoteField.fill("3000");

        // The 50/50 preset auto-fills two installments at 1500 each when the
        // quote is set. We don't need to touch the installment rows directly.
        await page.getByRole("button", { name: /^50\/50$/ }).click();

        await page.getByRole("button", { name: /send proposal/i }).click();
      });

      await test.step("proposal row + proposed schedule land in the DB", async () => {
        let lastSnapshot: Awaited<ReturnType<typeof getProposalSnapshot>> =
          null;
        await expect
          .poll(
            async () => {
              lastSnapshot = await getProposalSnapshot(
                ctx.eventId,
                ctx.plannerProfileId,
              );
              return lastSnapshot;
            },
            { timeout: 15_000, intervals: [250, 500, 1000, 2000] },
          )
          .toMatchObject({
            proposalStatus: "pending",
            scheduleStatus: "proposed",
            installmentCount: 2,
          });

        // Freeze the deposit installment id for step 3. Installments are
        // ordered by `created_at` ascending inside getProposalSnapshot, so
        // the first one is the deposit-equivalent slot (under a 50/50 preset
        // they're identical anyway).
        ctx.depositInstallmentId = lastSnapshot!.installmentIds[0];
      });
    } finally {
      await browserCtx.close();
    }
  });

  test("client accepts the plan and pays the deposit via Stripe Checkout", async ({
    browser,
  }) => {
    // Stripe Checkout + webhook round-trip needs more headroom than the
    // default 60s cap.
    test.setTimeout(180_000);

    expect(ctx.eventId).toBeTruthy();
    expect(ctx.depositInstallmentId).toBeTruthy();

    const browserCtx = await browser.newContext({ storageState: CLIENT_STATE });
    const page = await browserCtx.newPage();
    try {
      await test.step("accept the proposal + plan", async () => {
        await page.goto(
          `/dashboard/client/event/${ctx.eventId}?tab=proposals`,
        );
        await page
          .getByRole("button", { name: /accept proposal & plan/i })
          .first()
          .click();
        // The button is replaced by a disabled "Accepted" state; poll the DB
        // instead of chasing UI copy — this is what test 4 depends on anyway.
        await expect
          .poll(
            () => getScheduleStatus(ctx.eventId, ctx.plannerProfileId),
            { timeout: 15_000 },
          )
          .toBe("active");
      });

      await test.step("click Pay now and submit the Stripe test card", async () => {
        await page.goto(
          `/dashboard/client/event/${ctx.eventId}?tab=payments`,
        );
        await page
          .getByRole("button", { name: /pay now/i })
          .first()
          .click();

        await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });
        // Stripe's hosted Checkout is a heavy SPA — wait for the submit
        // button testid before we even try to fill fields, otherwise we race
        // against hydration.
        await page
          .getByTestId("hosted-payment-submit-button")
          .waitFor({ state: "visible", timeout: 45_000 });

        // Email + cardholder name are client-required. Stripe's React inputs
        // sometimes ignore Playwright's synthetic `input` events from
        // `.fill()`, which manifests in CI as an apparently-clicked Pay
        // button that never submits ("REQUIRED" label appears). Click to
        // focus and `pressSequentially` (real keystrokes) is the reliable
        // path — slower, but the whole Stripe step is dominated by network.
        const email = page
          .locator('input[type="email"], input[name="email"]')
          .first();
        await email.waitFor({ state: "visible", timeout: 15_000 });
        await email.click();
        await email.pressSequentially("e2e+stripe@test.zaffa", { delay: 15 });
        await expect(email).toHaveValue("e2e+stripe@test.zaffa");

        // Card data lives inside Stripe-hosted iframes; `getByLabel` pierces
        // frames, and `.fill` works fine on those inputs (they aren't the
        // ones with the controlled-input quirk).
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
          await nameOnCard.pressSequentially("Playwright Tester", { delay: 15 });
          await expect(nameOnCard).toHaveValue("Playwright Tester");
        }

        // Country default is geo-based (France on GitHub's US runners —
        // don't ask). Fill a ZIP only if the country renders one.
        const postal = page.getByLabel(/zip|postal/i).first();
        if (await postal.isVisible().catch(() => false)) {
          await postal.fill("10000");
        }

        await page.getByTestId("hosted-payment-submit-button").click();

        // Stripe redirects back with ?paid=<installmentId>.
        await page.waitForURL(
          new RegExp(
            `/dashboard/client/event/${ctx.eventId}\\?tab=payments&paid=${ctx.depositInstallmentId}`,
          ),
          { timeout: 60_000 },
        );
      });

      await test.step("DB flips the deposit installment to paid", async () => {
        await expect
          .poll(() => getPaymentStatus(ctx.depositInstallmentId), {
            message: "Stripe webhook should mark the deposit paid",
            timeout: 45_000,
            intervals: [500, 1000, 2000, 2500],
          })
          .toBe("paid");
      });

      await test.step("UI reflects the paid status", async () => {
        // The SchedulePanel polls `paymentSchedules.forEvent` every 2.5s so
        // we give the badge up to three poll cycles to show up.
        const paidBadge = page
          .locator(`[data-installment-id="${ctx.depositInstallmentId}"]`)
          .getByText(/paid/i)
          .first();
        // Fallback: generic text match if the structural locator isn't wired.
        const hasStructural =
          (await page
            .locator(`[data-installment-id="${ctx.depositInstallmentId}"]`)
            .count()) > 0;
        if (hasStructural) {
          await expect(paidBadge).toBeVisible({ timeout: 15_000 });
        } else {
          await expect(page.getByText(/\bpaid\b/i).first()).toBeVisible({
            timeout: 15_000,
          });
        }
      });
    } finally {
      await browserCtx.close();
    }
  });

  test("admin records the off-Stripe payout for the deposit", async ({
    browser,
  }) => {
    expect(ctx.depositInstallmentId).toBeTruthy();

    const browserCtx = await browser.newContext({ storageState: ADMIN_STATE });
    const page = await browserCtx.newPage();
    try {
      await test.step("open the admin payouts queue and open the Record payout dialog", async () => {
        await page.goto("/dashboard/admin/payouts");
        // Wait for the queue to render; "Record payout" lives in each planner
        // card. Pick the one inside a container that also shows the seeded
        // business name so we open the correct planner's dialog.
        const trigger = page
          .locator(":has-text('E2E Planner Co.')")
          .getByRole("button", { name: /record payout/i })
          .first();
        await trigger.waitFor({ state: "visible", timeout: 15_000 });
        await trigger.click();
      });

      await test.step("tick the deposit installment in the dialog", async () => {
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ state: "visible", timeout: 10_000 });

        // The installment list inside the dialog is populated by a lazy tRPC
        // query — wait until at least one checkbox is present before acting.
        const dialogCheckboxes = dialog.locator('input[type="checkbox"]');
        await expect
          .poll(() => dialogCheckboxes.count(), { timeout: 10_000 })
          .toBeGreaterThan(0);

        const n = await dialogCheckboxes.count();
        for (let i = 0; i < n; i += 1) {
          const cb = dialogCheckboxes.nth(i);
          // `.check()` with force:true — we know the input is visible and
          // interactive (the whole dialog is mounted & focused), but we want
          // to bypass width-zero/scroll-parent actionability false-positives.
          await cb.check({ force: true });
          await expect(cb).toBeChecked();
        }
      });

      await test.step("submit the Record payout dialog", async () => {
        const dialog = page.getByRole("dialog");
        const submit = dialog.getByRole("button", { name: /^record payout$/i });
        // Only enabled once the payout total is > 0, i.e. at least one
        // checkbox is ticked.
        await expect(submit).toBeEnabled({ timeout: 10_000 });
        await submit.click();
        // Dialog should dismiss on success; wait for that as a proxy for
        // "mutation committed" before we hit the DB.
        await expect(dialog).toBeHidden({ timeout: 15_000 });
      });

      await test.step("payout row exists in the DB and links the deposit", async () => {
        await expect
          .poll(
            () => getPayoutForInstallment(ctx.depositInstallmentId),
            { timeout: 15_000 },
          )
          .not.toBeNull();

        const payout = await getPayoutForInstallment(ctx.depositInstallmentId);
        expect(payout, "payout should be recorded").not.toBeNull();
        expect(payout!.plannerId).toBe(ctx.plannerProfileId);
        expect(payout!.amount).toBeGreaterThan(0);
      });
    } finally {
      await browserCtx.close();
    }
  });
});
