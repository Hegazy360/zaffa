import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Upstash is replaced by a limiter whose `limit` the test controls, and
// Postgres by a `$queryRaw` the test controls, so which counter answers - and
// what happens when neither can - is tested without a network.
const h = vi.hoisted(() => ({
  limit: vi.fn<(id: string) => Promise<{ success: boolean; remaining: number; reset: number }>>(),
  queryRaw: vi.fn(),
  reportError: vi.fn(),
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
vi.mock("@/lib/logger", () => ({ reportError: h.reportError }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      h.queryRaw(strings.join("?"), ...values),
  },
}));

const { consume, enforceTrpc, ipFromRequest, windowMs, resetRateLimitBreaker } =
  await import("@/lib/rate-limit");

const DOWN = new Error("getaddrinfo ENOTFOUND primary-raven-114752.upstash.io");

beforeEach(() => {
  h.limit.mockReset();
  h.queryRaw.mockReset();
  h.reportError.mockReset();
  resetRateLimitBreaker();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

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

describe("windowMs", () => {
  it.each([
    ["1 m", 60_000],
    ["10 m", 600_000],
    ["1 h", 3_600_000],
    ["1 d", 86_400_000],
    ["30 s", 30_000],
  ] as const)("reads %s", (window, ms) => {
    expect(windowMs(window)).toBe(ms);
  });
});

describe("when Upstash answers", () => {
  it("uses its verdict and never touches Postgres", async () => {
    h.limit.mockResolvedValueOnce({ success: false, remaining: 0, reset: 1 });
    await expect(consume("aiIntakeDaily", "ip:1.2.3.4")).resolves.toEqual({
      success: false,
      remaining: 0,
      reset: 1,
    });
    expect(h.queryRaw).not.toHaveBeenCalled();
  });
});

describe("when Upstash cannot be reached", () => {
  // The production incident this exists for: the Upstash database was
  // deleted, every call failed on DNS, and because the limiters failed open
  // every cap in production silently stopped limiting anything.
  beforeEach(() => {
    h.limit.mockRejectedValue(DOWN);
  });

  it("counts in Postgres, so the cap still holds", async () => {
    // aiRender is 30 an hour.
    h.queryRaw.mockResolvedValueOnce([{ hits: 30 }]);
    await expect(consume("aiRender", "u1")).resolves.toMatchObject({
      success: true,
      remaining: 0,
    });
    h.queryRaw.mockResolvedValueOnce([{ hits: 31 }]);
    await expect(consume("aiRender", "u1")).resolves.toMatchObject({
      success: false,
    });
    await expect(
      (async () => {
        h.queryRaw.mockResolvedValueOnce([{ hits: 31 }]);
        await enforceTrpc("aiRender", "u1", "slow down");
      })(),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: "slow down" });
  });

  it("keys the Postgres bucket by prefix and identifier, in a window aligned to its length", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T10:37:12Z"));
    h.queryRaw.mockResolvedValueOnce([{ hits: 1 }]);
    const res = await consume("aiIntake", "ip:1.2.3.4");
    const [sql, bucket, windowStart] = h.queryRaw.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO rate_limit_hits");
    expect(sql).toContain("ON CONFLICT (bucket, window_start)");
    expect(bucket).toBe("rl:ai:intake:ip:1.2.3.4");
    expect(windowStart).toEqual(new Date("2026-09-25T10:00:00Z"));
    expect(res.reset).toBe(new Date("2026-09-25T11:00:00Z").getTime());
  });

  it("stops asking Upstash for a minute after it fails, then tries again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T10:00:00Z"));
    h.queryRaw.mockResolvedValue([{ hits: 1 }]);

    await consume("chat", "ip:1");
    await consume("chat", "ip:1");
    await consume("chat", "ip:1");
    expect(h.limit).toHaveBeenCalledTimes(1);
    expect(h.queryRaw).toHaveBeenCalledTimes(3);
    // Reported to Sentry once, not once per request.
    expect(h.reportError).toHaveBeenCalledTimes(1);
    expect(h.reportError).toHaveBeenCalledWith(
      "rate_limit.upstash_unreachable",
      DOWN,
      { key: "chat" },
    );

    vi.setSystemTime(new Date("2026-09-25T10:01:01Z"));
    h.limit.mockResolvedValueOnce({ success: true, remaining: 9, reset: 1 });
    await expect(consume("chat", "ip:1")).resolves.toEqual({
      success: true,
      remaining: 9,
      reset: 1,
    });
    expect(h.limit).toHaveBeenCalledTimes(2);
    expect(h.queryRaw).toHaveBeenCalledTimes(3);
  });
});

describe("when neither counter can be reached", () => {
  beforeEach(() => {
    h.limit.mockRejectedValue(DOWN);
    h.queryRaw.mockRejectedValue(new Error("connection refused"));
  });

  it("allows by default: a limiter must never take the app down", async () => {
    await expect(consume("aiRender", "u1")).resolves.toEqual({ success: true });
    await expect(enforceTrpc("aiRender", "u1")).resolves.toBeUndefined();
  });

  it("refuses when the caller asks to fail closed, as the intake check does", async () => {
    await expect(
      consume("aiIntakeGlobalDaily", "global", { failClosed: true }),
    ).resolves.toEqual({ success: false });
    await expect(
      enforceTrpc("aiIntakeGlobalDaily", "global", "slow down", { failClosed: true }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: "slow down" });
  });
});
