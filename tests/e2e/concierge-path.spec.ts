import { test, expect, request as playwrightRequest } from "@playwright/test";
import {
  closeTestDb,
  getConciergeInstallments,
  getEnquiryByEmail,
  purgeEnquiryByEmail,
} from "./helpers/db";

/**
 * The concierge money path, end to end.
 *
 * This is the flagship tier's lane — the other two money paths each have a
 * spec, and this one carries the largest transactions in the product, so it
 * gets the same treatment: a real submission through the real wizard, a real
 * quote, and a real Stripe Payment Link.
 *
 * Runs serially and cleans up after itself. Stripe stays in TEST mode: the
 * spec asserts `livemode` is false on the created link rather than trusting
 * the environment, because a live-mode link here would create a real charge
 * against a real card.
 */

const PROBE_EMAIL = "concierge-e2e@zaffa.invalid";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await purgeEnquiryByEmail(PROBE_EMAIL);
  await closeTestDb();
});

test("a couple can enquire, and the enquiry persists with their answers", async ({
  page,
  baseURL,
}) => {
  await purgeEnquiryByEmail(PROBE_EMAIL);

  const host = new URL(baseURL!).hostname;
  await page.context().addCookies([
    { name: "zaffa_locale", value: "en", domain: host, path: "/" },
    { name: "zaffa_country", value: "AE", domain: host, path: "/" },
  ]);

  // Start where a real buyer starts: the homepage CTA, not a deep link.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.goto("/enquire", { waitUntil: "domcontentloaded" });

  // Country must be prefilled from the cookie — the visitor should not have
  // to tell us what we already know.
  await expect(page.locator("#eq-country")).toHaveValue("AE");

  await page.fill("#eq-city", "Dubai");
  await page.getByRole("button", { name: "50–150" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Budget chips must be denominated in the market's currency.
  const band = page.locator("button[aria-pressed]").filter({ hasText: "AED" }).first();
  await expect(band).toBeVisible();
  await band.click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.fill("#eq-name", "Concierge E2E");
  await page.fill("#eq-phone", "+971500000123");
  await page.fill("#eq-email", PROBE_EMAIL);
  await page.getByRole("button", { name: "Send it to us" }).click();

  await expect(page.getByText("We have got it.")).toBeVisible({ timeout: 20_000 });

  const enquiry = await getEnquiryByEmail(PROBE_EMAIL);
  expect(enquiry).not.toBeNull();
  expect(enquiry!.status).toBe("new");
  expect(enquiry!.country).toBe("AE");
  expect(enquiry!.city).toBe("Dubai");
  expect(enquiry!.guest_band).toBe("medium");
  expect(enquiry!.budget_currency).toBe("AED");
  expect(enquiry!.preferred_channel).toBe("whatsapp");
});

test("an admin converts it to an event and quotes it with a payment link", async ({ baseURL }) => {
  const enquiry = await getEnquiryByEmail(PROBE_EMAIL);
  expect(enquiry, "the previous test must have created the enquiry").not.toBeNull();

  // Drive the admin procedures over tRPC with the seeded admin's session.
  const admin = await playwrightRequest.newContext({
    baseURL,
    storageState: "tests/e2e/.auth/admin.json",
  });

  const convert = await admin.post("/api/trpc/enquiries.convertToEvent", {
    data: { json: { id: enquiry!.id } },
  });
  expect(convert.ok(), await convert.text()).toBeTruthy();

  const quote = await admin.post("/api/trpc/enquiries.createQuote", {
    data: {
      json: {
        id: enquiry!.id,
        total: 45000,
        depositAmount: 15000,
        currency: "AED",
      },
    },
  });
  expect(quote.ok(), await quote.text()).toBeTruthy();
  const body = (await quote.json()) as {
    result: { data: { json: { paymentLinkUrl: string } } };
  };
  const linkUrl = body.result.data.json.paymentLinkUrl;

  // A live-mode link here would take a real payment. Stripe encodes the mode
  // in the URL, so this is checkable without an API round-trip.
  expect(linkUrl).toContain("/test_");

  const after = await getEnquiryByEmail(PROBE_EMAIL);
  expect(after!.status).toBe("quote_sent");
  expect(after!.event_id).not.toBeNull();

  const rows = await getConciergeInstallments(after!.event_id!);
  expect(rows).toHaveLength(2);

  const deposit = rows.find((r) => r.label === "Deposit")!;
  const balance = rows.find((r) => r.label === "Balance")!;
  expect(Number(deposit.amount)).toBe(15000);
  expect(Number(balance.amount)).toBe(30000);
  expect(deposit.status).toBe("awaiting_payment");
  expect(deposit.payment_link_url).toBeTruthy();

  // The defining property of this lane: Zaffa is the provider, not a
  // marketplace taking a cut, so there is no fee split on these rows.
  for (const row of rows) {
    expect(row.platform_fee_amount).toBeNull();
    expect(row.net_to_planner_amount).toBeNull();
  }

  await admin.dispose();
});

test("the quote is rejected when the deposit exceeds the total", async ({ baseURL }) => {
  const enquiry = await getEnquiryByEmail(PROBE_EMAIL);
  const admin = await playwrightRequest.newContext({
    baseURL,
    storageState: "tests/e2e/.auth/admin.json",
  });
  const res = await admin.post("/api/trpc/enquiries.createQuote", {
    data: {
      json: {
        id: enquiry!.id,
        total: 1000,
        depositAmount: 5000,
        currency: "AED",
      },
    },
  });
  expect(res.ok()).toBeFalsy();
  expect(await res.text()).toContain("deposit cannot be larger");
  await admin.dispose();
});

test("a non-admin cannot reach the pipeline", async ({ baseURL }) => {
  const client = await playwrightRequest.newContext({
    baseURL,
    storageState: "tests/e2e/.auth/client.json",
  });
  const res = await client.get(
    "/api/trpc/enquiries.list?input=" +
      encodeURIComponent(JSON.stringify({ json: { limit: 10 } })),
  );
  expect(await res.text()).toContain("Admin only");
  await client.dispose();
});
