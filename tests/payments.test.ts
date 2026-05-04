import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeFee,
  decimalToNumber,
  fromStripeAmount,
  getDefaultPlatformFeePct,
  paymentSuccessUrlBase,
  platformName,
  toStripeAmount,
} from "@/lib/payments";

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("computeFee", () => {
  it("splits a charge into platform fee + planner net at the configured pct", () => {
    const result = computeFee(1000, 8);
    expect(result.feeAmount).toBeCloseTo(80, 2);
    expect(result.netAmount).toBeCloseTo(920, 2);
    expect(result.feePct).toBe(8);
    expect(result.total).toBe(1000);
  });

  it("handles 0% fee", () => {
    expect(computeFee(500, 0)).toEqual({
      total: 500,
      feeAmount: 0,
      netAmount: 500,
      feePct: 0,
    });
  });

  it("clamps invalid pct to 0", () => {
    expect(computeFee(500, NaN).feePct).toBe(0);
    expect(computeFee(500, -10).feePct).toBe(0);
    expect(computeFee(500, 200).feePct).toBe(0);
  });

  it("rounds the fee to whole units (cents reconcile via net)", () => {
    const r = computeFee(123.45, 7.5);
    expect(r.feeAmount + r.netAmount).toBeCloseTo(123.45, 2);
  });
});

describe("decimalToNumber", () => {
  it("returns 0 for nullish values", () => {
    expect(decimalToNumber(null)).toBe(0);
    expect(decimalToNumber(undefined)).toBe(0);
  });

  it("passes numbers through", () => {
    expect(decimalToNumber(42.5)).toBe(42.5);
  });

  it("parses numeric strings", () => {
    expect(decimalToNumber("120.50")).toBe(120.5);
  });

  it("calls toString on Decimal-like objects", () => {
    expect(decimalToNumber({ toString: () => "999.99" })).toBe(999.99);
  });

  it("falls back to 0 for unparseable strings", () => {
    expect(decimalToNumber("not-a-number")).toBe(0);
  });
});

describe("Stripe amount conversion", () => {
  it("multiplies by 100 for two-decimal currencies", () => {
    expect(toStripeAmount(12.34, "EGP")).toBe(1234);
    expect(toStripeAmount(12.34, "USD")).toBe(1234);
  });

  it("does not multiply for zero-decimal currencies", () => {
    expect(toStripeAmount(1234, "JPY")).toBe(1234);
    expect(toStripeAmount(1234, "KRW")).toBe(1234);
  });

  it("inverse is consistent", () => {
    const major = 99.5;
    expect(fromStripeAmount(toStripeAmount(major, "EGP"), "EGP")).toBeCloseTo(
      major,
      2,
    );
    expect(fromStripeAmount(toStripeAmount(major, "JPY"), "JPY")).toBe(100);
  });
});

describe("getDefaultPlatformFeePct", () => {
  it("returns the 8% built-in default when PLATFORM_FEE_PCT is unset", () => {
    delete process.env.PLATFORM_FEE_PCT;
    expect(getDefaultPlatformFeePct()).toBe(8);
  });

  it("returns the env-overridden value when valid", () => {
    process.env.PLATFORM_FEE_PCT = "5";
    expect(getDefaultPlatformFeePct()).toBe(5);
  });

  it("falls back to the default when the env value is not a number", () => {
    process.env.PLATFORM_FEE_PCT = "not-a-number";
    expect(getDefaultPlatformFeePct()).toBe(8);
  });

  it("falls back to the default when the env value is out of range", () => {
    process.env.PLATFORM_FEE_PCT = "150";
    expect(getDefaultPlatformFeePct()).toBe(8);
    process.env.PLATFORM_FEE_PCT = "-1";
    expect(getDefaultPlatformFeePct()).toBe(8);
  });
});

describe("decimalToNumber: exotic inputs", () => {
  it("returns 0 for non-string/number/object inputs (boolean, symbol)", () => {
    expect(decimalToNumber(true as unknown)).toBe(0);
    expect(decimalToNumber(Symbol("x") as unknown)).toBe(0);
  });

  it("returns 0 for objects without a usable toString result", () => {
    expect(decimalToNumber({ toString: () => "not-a-number" })).toBe(0);
  });
});

describe("env-derived helpers", () => {
  it("platformName falls back to Zaffa when PLATFORM_NAME is unset", () => {
    delete process.env.PLATFORM_NAME;
    expect(platformName()).toBe("Zaffa");
    process.env.PLATFORM_NAME = "Custom Co";
    expect(platformName()).toBe("Custom Co");
  });

  it("paymentSuccessUrlBase prefers PAYMENT_SUCCESS_URL_BASE then NEXT_PUBLIC_SITE_URL then localhost", () => {
    delete process.env.PAYMENT_SUCCESS_URL_BASE;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(paymentSuccessUrlBase()).toBe("http://localhost:3000");

    process.env.NEXT_PUBLIC_SITE_URL = "https://site.test";
    expect(paymentSuccessUrlBase()).toBe("https://site.test");

    process.env.PAYMENT_SUCCESS_URL_BASE = "https://primary.test";
    expect(paymentSuccessUrlBase()).toBe("https://primary.test");
  });
});
