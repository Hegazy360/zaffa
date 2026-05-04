import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertProductionEnv,
  isAuthorizedCronRequest,
} from "@/lib/env-checks";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>)[key];
  } else {
    (process.env as Record<string, string | undefined>)[key] = value;
  }
}

describe("assertProductionEnv", () => {
  it("does nothing when NODE_ENV is not production", () => {
    setEnv("NODE_ENV", "development");
    expect(() => assertProductionEnv()).not.toThrow();
  });

  it("throws when required env vars are missing in production", () => {
    setEnv("NODE_ENV", "production");
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => assertProductionEnv()).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("accepts either key from the either-or pairs", () => {
    setEnv("NODE_ENV", "production");
    for (const k of [
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "CRON_SECRET",
      "NOTIFICATION_UNSUBSCRIBE_SECRET",
    ]) {
      process.env[k] = "stub";
    }
    process.env.KV_REST_API_URL = "https://stub";
    process.env.KV_REST_API_TOKEN = "stub";
    expect(() => assertProductionEnv()).not.toThrow();
  });
});

describe("isAuthorizedCronRequest", () => {
  it("rejects in production when CRON_SECRET is unset (fail-closed)", () => {
    setEnv("NODE_ENV", "production");
    delete process.env.CRON_SECRET;
    const req = new Request("http://localhost/cron");
    expect(isAuthorizedCronRequest(req)).toBe(false);
  });

  it("accepts in development when CRON_SECRET is unset (fail-open for local debugging)", () => {
    setEnv("NODE_ENV", "development");
    delete process.env.CRON_SECRET;
    const req = new Request("http://localhost/cron");
    expect(isAuthorizedCronRequest(req)).toBe(true);
  });

  it("rejects with the wrong bearer", () => {
    process.env.CRON_SECRET = "real-secret";
    const req = new Request("http://localhost/cron", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(isAuthorizedCronRequest(req)).toBe(false);
  });

  it("accepts the matching bearer", () => {
    process.env.CRON_SECRET = "real-secret";
    const req = new Request("http://localhost/cron", {
      headers: { authorization: "Bearer real-secret" },
    });
    expect(isAuthorizedCronRequest(req)).toBe(true);
  });
});
