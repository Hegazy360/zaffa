import { beforeEach, describe, expect, it, vi } from "vitest";

// Upstash is replaced by a limiter whose `limit` the test controls, so the
// fail-open / fail-closed rule is tested without a network.
const h = vi.hoisted(() => ({
  limit: vi.fn<(id: string) => Promise<{ success: boolean; remaining: number; reset: number }>>(),
}));

vi.mock("@/lib/redis", () => ({ redis: {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    limit = (id: string) => h.limit(id);
  },
}));

const { consume, enforceTrpc, ipFromRequest } = await import("@/lib/rate-limit");

describe("ipFromRequest", () => {
  it("returns the first ip from x-forwarded-for", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    expect(ipFromRequest(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    expect(ipFromRequest(req)).toBe("9.8.7.6");
  });

  it("returns 'unknown' when no proxy headers", () => {
    const req = new Request("http://localhost/");
    expect(ipFromRequest(req)).toBe("unknown");
  });
});

describe("when Upstash cannot be reached", () => {
  beforeEach(() => {
    h.limit.mockReset();
    h.limit.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("allows by default: a limiter must never take the app down", async () => {
    await expect(consume("aiRender", "u1")).resolves.toEqual({ success: true });
    await expect(enforceTrpc("aiRender", "u1")).resolves.toBeUndefined();
  });

  it("refuses when the caller asks to fail closed, as the intake check does", async () => {
    await expect(consume("aiIntakeGlobalDaily", "global", { failClosed: true })).resolves.toEqual({
      success: false,
    });
    await expect(
      enforceTrpc("aiIntakeGlobalDaily", "global", "slow down", { failClosed: true }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: "slow down" });
  });

  it("still answers with Upstash's verdict when it is reachable", async () => {
    h.limit.mockResolvedValueOnce({ success: false, remaining: 0, reset: 1 });
    await expect(consume("aiIntakeDaily", "ip:1.2.3.4", { failClosed: true })).resolves.toEqual({
      success: false,
      remaining: 0,
      reset: 1,
    });
    h.limit.mockResolvedValueOnce({ success: true, remaining: 59, reset: 1 });
    await expect(
      enforceTrpc("aiIntakeDaily", "ip:1.2.3.4", "slow down", { failClosed: true }),
    ).resolves.toBeUndefined();
  });
});
