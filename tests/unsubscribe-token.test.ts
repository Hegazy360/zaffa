import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/server/services/notifications/unsubscribe-token";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.NOTIFICATION_UNSUBSCRIBE_SECRET =
    "test-secret-test-secret-test-secret"; // >=16 chars
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
});

describe("unsubscribe token", () => {
  it("round-trips a valid token", () => {
    const token = signUnsubscribeToken("user-123");
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: "user-123" });
  });

  it("rejects a tampered signature", () => {
    const token = signUnsubscribeToken("user-123");
    const [payload] = token.split(".");
    const tampered = `${payload}.AAAA`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signUnsubscribeToken("user-123");
    const [, sig] = token.split(".");
    const altered = `${Buffer.from("user-456.0", "utf8").toString("base64url")}.${sig}`;
    expect(verifyUnsubscribeToken(altered)).toBeNull();
  });

  it("rejects an expired token (older than 90 days)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const token = signUnsubscribeToken("user-123");
    vi.setSystemTime(new Date("2024-05-01T00:00:00Z"));
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("not-a-token")).toBeNull();
    expect(verifyUnsubscribeToken("abc.def.ghi")).toBeNull();
  });

  it("throws when secret is unset or too short", () => {
    delete process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
    expect(() => signUnsubscribeToken("user")).toThrow();
    process.env.NOTIFICATION_UNSUBSCRIBE_SECRET = "short";
    expect(() => signUnsubscribeToken("user")).toThrow();
  });
});
