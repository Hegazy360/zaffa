import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Single-worker, sequential E2E run. The "money path" spec mutates a shared
// test database; running it in parallel would race itself. CI uses the same
// config — no separate playwright.ci.ts.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const SKIP_E2E = process.env.SKIP_E2E === "1";

export default defineConfig({
  testDir: path.resolve(__dirname, "tests/e2e"),
  testIgnore: SKIP_E2E ? ["**/*"] : undefined,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      // The visual net runs in its own projects below — keeping it out of
      // the functional project stops every feature PR from re-rendering
      // 12 full-page screenshots.
      testIgnore: /(visual|rtl|share-cards)\.spec\.ts/,
    },
    // RTL correctness assertions (ZAF-36). Public surfaces only, so no auth
    // setup dependency — these must be runnable without a seeded database.
    {
      name: "rtl",
      testMatch: /rtl\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Share cards (ZAF-49). Public surfaces, no auth setup dependency — the
    // whole point is that a link preview works for someone who has never
    // signed in.
    {
      name: "share-cards",
      testMatch: /share-cards\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Visual-regression net (ZAF-31). Public surfaces only, no auth setup
    // dependency, reducedMotion so entrance animations collapse to their
    // settled state deterministically.
    {
      name: "visual-desktop",
      testMatch: /visual\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        contextOptions: { reducedMotion: "reduce" },
      },
    },
    {
      name: "visual-mobile",
      testMatch: /visual\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        contextOptions: { reducedMotion: "reduce" },
      },
    },
  ],

  // Boots `next dev` on E2E_PORT before the spec runs.
  //
  // Locally we load `.env.test` through dotenvx so individual runs don't
  // have to remember to `source` anything. In CI the env lives in the job
  // block (secrets + literal vars), so the dotenvx indirection would just
  // fail on the missing file — run `next dev` directly there.
  //
  // The seed step + Stripe CLI listener are expected to be kicked off
  // separately by `scripts/e2e-bootstrap.sh` (or the CI workflow) so the
  // dev server doesn't have to manage their lifecycle.
  webServer: {
    command: process.env.CI
      ? `npx next dev -p ${PORT}`
      : `npx dotenvx run --env-file=.env.test -- npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
