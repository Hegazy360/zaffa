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

  // The visual baselines are platform-specific — Playwright suffixes them
  // `-darwin`, and font rasterisation differs enough between macOS and the
  // Linux runner that a shared set is not possible without a container.
  // Rather than let CI fail on missing snapshots or, worse, silently write
  // Linux ones alongside, the visual projects are skipped there. They are a
  // local pre-push net; the correctness projects below are the CI gate.
  ignoreSnapshots: !!process.env.CI,
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
      // Money paths and other flows that need a seeded, signed-in database.
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /(money-path|pack-path|concierge-path)\.spec\.ts/,
    },

    // ---- The correctness matrix (ZAF-69) -----------------------------------
    //
    // The product's primary user is Arabic, on a phone. Until now every spec
    // ran as a desktop English visitor, so the market we are actually building
    // for was tested by none of them.
    //
    // Both projects run the same public specs. No auth setup: these must work
    // for someone who has never signed in. The locale comes from the browser's
    // `Accept-Language`, which the middleware already negotiates — so a spec
    // gets an Arabic, RTL page without any cookie plumbing, and a spec that
    // needs a *specific* locale still sets its own cookie and overrides it.
    {
      name: "desktop-en",
      use: { ...devices["Desktop Chrome"], locale: "en-US" },
      testMatch:
        /(rtl|eyebrow|eyebrow-live|confirm|media|keyboard|share-cards|first-impression|axe|studio-handoff|decor-plan|venue-photo)\.spec\.ts/,
    },
    {
      name: "mobile-ar",
      use: {
        ...devices["Pixel 7"],
        locale: "ar-EG",
        timezoneId: "Africa/Cairo",
      },
      // Share cards and first-impression states iterate locales internally, so
      // running them here would only repeat work. Everything else is a genuine
      // second environment.
      testMatch: /(rtl|eyebrow|eyebrow-live|confirm|media|keyboard|axe|studio-handoff|decor-plan|venue-photo)\.spec\.ts/,
    },

    // Visual-regression net (ZAF-31). Iterates locales internally, and pins
    // reducedMotion so entrance animations settle deterministically.
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
