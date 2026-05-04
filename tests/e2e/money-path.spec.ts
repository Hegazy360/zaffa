import { test, expect } from "@playwright/test";
import path from "node:path";

// The "money path" — the single end-to-end scenario the plan calls out as
// the critical-path covering Sign up → Create event → Send proposal →
// Pay an installment via Stripe test mode → Planner payout.
//
// One spec, one worker. We intentionally keep this monolithic because the
// steps are deeply ordered (you can't pay before the planner sends a
// schedule, you can't release a payout before payment is paid).
//
// Stripe test card: 4242 4242 4242 4242, any future expiry, any CVC, any ZIP.

const AUTH_DIR = path.resolve(__dirname, ".auth");
const CLIENT_STATE = path.join(AUTH_DIR, "client.json");
const PLANNER_STATE = path.join(AUTH_DIR, "planner.json");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");

test.describe.configure({ mode: "serial" });

test.describe("money path: signup -> proposal -> stripe pay -> payout", () => {
  let eventTitle: string;
  let installmentLabel: string;

  test.beforeAll(() => {
    // Unique event title per run so a re-run against an already-seeded
    // database doesn't collide with prior fixtures.
    const stamp = Date.now();
    eventTitle = `Playwright Wedding ${stamp}`;
    installmentLabel = `Deposit ${stamp}`;
  });

  test("client creates an event from their dashboard", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: CLIENT_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto("/dashboard/client");
      await page.getByRole("button", { name: /(create|new) event/i }).click();
      await page.getByLabel(/title/i).fill(eventTitle);
      await page.getByLabel(/event type/i).selectOption("wedding");
      // Date 90 days out so it's safely in the future regardless of when
      // the test runs. Using ISO yyyy-mm-dd works with native date inputs.
      const future = new Date(Date.now() + 90 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      await page.getByLabel(/event date/i).fill(future);
      await page.getByRole("button", { name: /create/i }).click();
      await expect(page.getByText(eventTitle)).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("planner sends a proposal with a 3-installment schedule", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: PLANNER_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto("/dashboard/planner/marketplace");
      await page.getByText(eventTitle).click();
      await page.getByRole("button", { name: /send proposal/i }).click();

      await page.getByLabel(/quote amount/i).fill("3000");
      await page.getByRole("button", { name: /add installment/i }).click();
      await page.getByPlaceholder(/label/i).first().fill(installmentLabel);
      await page.getByPlaceholder(/amount/i).first().fill("1000");

      await page.getByRole("button", { name: /send/i }).click();
      await expect(page.getByText(/proposal sent/i)).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("client accepts the proposal and pays the deposit via Stripe test mode", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: CLIENT_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto("/dashboard/client");
      await page.getByText(eventTitle).click();
      await page.getByRole("tab", { name: /proposals/i }).click();
      await page.getByRole("button", { name: /accept/i }).click();

      await page.getByRole("tab", { name: /payments/i }).click();
      await page.getByRole("button", { name: /pay now/i }).first().click();

      // Stripe Checkout opens in a top-level navigation; we follow it in
      // the same page. Selectors below target the canonical Stripe-hosted
      // form inputs, which are stable across versions.
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
      await page.getByLabel(/card number/i).fill("4242424242424242");
      await page.getByLabel(/expiration|expiry/i).fill("12 / 34");
      await page.getByLabel(/cvc/i).fill("123");
      // Some Stripe forms require a name on card; fill optimistically.
      const nameField = page.getByLabel(/name on card/i);
      if (await nameField.isVisible().catch(() => false)) {
        await nameField.fill("Playwright Tester");
      }
      await page.getByRole("button", { name: /pay/i }).click();

      // After Stripe redirects back, the SchedulePanel polls for the
      // webhook to land — be patient: Stripe CLI can take ~10s to forward.
      await page.waitForURL(/\/dashboard\/client\/event\//, { timeout: 60_000 });
      await expect(page.getByText(/statusPaid|paid/i).first()).toBeVisible({
        timeout: 60_000,
      });
    } finally {
      await ctx.close();
    }
  });

  test("admin marks the planner payout released", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ADMIN_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto("/dashboard/admin/payouts");
      // Filter to the row backed by the deposit installment.
      await page.getByText(eventTitle).first().click();
      await page.getByRole("button", { name: /release/i }).click();

      await expect(page.getByText(/released/i).first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
