import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

// Pre-baked storageState files per role. The other specs declare these as
// `test.use({ storageState: ... })` so each scenario starts already
// authenticated and the spec only exercises the feature under test rather
// than the auth flow itself.
const AUTH_DIR = path.resolve(__dirname, ".auth");
fs.mkdirSync(AUTH_DIR, { recursive: true });

interface Role {
  name: string;
  email: string;
  password: string;
  file: string;
}

const ROLES: Role[] = [
  {
    name: "client",
    email: process.env.E2E_CLIENT_EMAIL ?? "client@test.zaffa",
    password: process.env.E2E_CLIENT_PASSWORD ?? "test-password-123",
    file: path.join(AUTH_DIR, "client.json"),
  },
  {
    name: "planner",
    email: process.env.E2E_PLANNER_EMAIL ?? "planner@test.zaffa",
    password: process.env.E2E_PLANNER_PASSWORD ?? "test-password-123",
    file: path.join(AUTH_DIR, "planner.json"),
  },
  {
    name: "admin",
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@test.zaffa",
    password: process.env.E2E_ADMIN_PASSWORD ?? "test-password-123",
    file: path.join(AUTH_DIR, "admin.json"),
  },
];

for (const role of ROLES) {
  setup(`authenticate ${role.name}`, async ({ page }) => {
    // The auth pages live under (auth)/auth in the App Router. Adjust the
    // selectors here if the form ever changes — these are the stable test
    // ids from the editorial split-screen redesign.
    await page.goto("/auth/sign-in");

    await page.getByLabel(/email/i).fill(role.email);
    await page.getByLabel(/password/i).fill(role.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Sign-in lands on the role's dashboard — wait until the URL changes
    // off the auth page before persisting cookies.
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    await page.context().storageState({ path: role.file });
  });
}
