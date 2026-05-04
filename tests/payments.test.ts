import { describe, expect, it } from "vitest";
import {
  computeFee,
  decimalToNumber,
  fromStripeAmount,
  toStripeAmount,
} from "@/lib/payments";

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
