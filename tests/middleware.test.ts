import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// updateSession reaches into supabase + cookies; for these tests we just
// want a passthrough so middleware.ts can return a NextResponse to mutate.
const { updateSessionMock } = await vi.hoisted(async () => ({
  updateSessionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: updateSessionMock,
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SITE_PASSWORD;
  delete process.env.SITE_USERNAME;
  delete process.env.FLAG_PUBLIC_BROWSE;
  // The default fresh response the supabase middleware would return — we
  // mutate cookies on it inside the locale-seeding branch.
  updateSessionMock.mockImplementation(async () => NextResponse.next());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  updateSessionMock.mockReset();
});

const { middleware, config } = await import("@/middleware");

function buildRequest(
  url: string,
  init: { headers?: Record<string, string>; cookies?: Record<string, string> } = {}
): NextRequest {
  const headers = new Headers(init.headers ?? {});
  if (init.cookies) {
    headers.set(
      "cookie",
      Object.entries(init.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ")
    );
  }
  return new NextRequest(url, { headers });
}

describe("middleware: SITE_PASSWORD gate", () => {
  it("returns 401 when SITE_PASSWORD is set and no auth provided", async () => {
    process.env.SITE_PASSWORD = "letmein";
    const res = await middleware(buildRequest("https://app.test/"));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("rejects wrong basic auth credentials", async () => {
    process.env.SITE_PASSWORD = "letmein";
    const bad = `Basic ${Buffer.from("preview:wrong").toString("base64")}`;
    const res = await middleware(
      buildRequest("https://app.test/", { headers: { authorization: bad } })
    );
    expect(res.status).toBe(401);
  });

  it("accepts correct basic auth and falls through to updateSession on auth-aware routes", async () => {
    process.env.SITE_PASSWORD = "letmein";
    const ok = `Basic ${Buffer.from("preview:letmein").toString("base64")}`;
    const res = await middleware(
      buildRequest("https://app.test/dashboard", {
        headers: { authorization: ok, "accept-language": "en" },
        cookies: { zaffa_locale: "en" },
      })
    );
    expect(res.status).toBe(200);
    expect(updateSessionMock).toHaveBeenCalled();
  });

  it("accepts correct basic auth on marketing routes without hitting updateSession", async () => {
    process.env.SITE_PASSWORD = "letmein";
    const ok = `Basic ${Buffer.from("preview:letmein").toString("base64")}`;
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: { authorization: ok, "accept-language": "en" },
        cookies: { zaffa_locale: "en" },
      })
    );
    expect(res.status).toBe(200);
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("uses SITE_USERNAME when set, defaulting to 'preview' otherwise", async () => {
    process.env.SITE_PASSWORD = "letmein";
    process.env.SITE_USERNAME = "alice";
    const ok = `Basic ${Buffer.from("alice:letmein").toString("base64")}`;
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: { authorization: ok },
        cookies: { zaffa_locale: "en" },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("middleware: publicBrowse flag", () => {
  it("returns 404 for /vendors when the flag is off (default)", async () => {
    const res = await middleware(buildRequest("https://app.test/vendors"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("returns 404 for /planners when the flag is off", async () => {
    const res = await middleware(buildRequest("https://app.test/planners/123"));
    expect(res.status).toBe(404);
  });

  it("does NOT 404 those routes when the flag is on", async () => {
    process.env.FLAG_PUBLIC_BROWSE = "true";
    const res = await middleware(
      buildRequest("https://app.test/vendors", {
        cookies: { zaffa_locale: "en" },
      })
    );
    expect(res.status).toBe(200);
    // Public browse routes are intentionally not auth-aware — they should
    // skip the Supabase round-trip even when the flag lets them through.
    expect(updateSessionMock).not.toHaveBeenCalled();
  });
});

describe("middleware: auth-aware routing", () => {
  it.each(["/dashboard", "/dashboard/vendor", "/venue-designer", "/auth/signin"])(
    "calls updateSession on %s",
    async (path) => {
      const res = await middleware(
        buildRequest(`https://app.test${path}`, {
          cookies: { zaffa_locale: "en" },
        })
      );
      expect(res.status).toBe(200);
      expect(updateSessionMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["/", "/about", "/sitemap.xml", "/robots.txt"])(
    "skips updateSession on public route %s",
    async (path) => {
      const res = await middleware(
        buildRequest(`https://app.test${path}`, {
          cookies: { zaffa_locale: "en" },
        })
      );
      expect(res.status).toBe(200);
      expect(updateSessionMock).not.toHaveBeenCalled();
    }
  );
});

describe("middleware: locale cookie seeding", () => {
  it("seeds the locale cookie from Accept-Language on first hit", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: { "accept-language": "ar-EG,ar;q=0.9,en;q=0.8" },
      })
    );
    const cookie = res.cookies.get("zaffa_locale");
    expect(cookie?.value).toBe("ar");
  });

  it("falls back to the default locale when Accept-Language is empty", async () => {
    const res = await middleware(buildRequest("https://app.test/"));
    const cookie = res.cookies.get("zaffa_locale");
    expect(cookie?.value).toBe("en");
  });

  it("leaves an existing valid locale cookie alone", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: { "accept-language": "en" },
        cookies: { zaffa_locale: "ar" },
      })
    );
    expect(res.cookies.get("zaffa_locale")).toBeUndefined();
  });

  it("re-seeds when the cookie value isn't a known locale", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: { "accept-language": "fr" },
        cookies: { zaffa_locale: "klingon" },
      })
    );
    expect(res.cookies.get("zaffa_locale")?.value).toBe("en"); // matched fallback
  });
});

describe("middleware: matcher", () => {
  it("excludes /api/* from the matcher", () => {
    // Sanity check on the export so a future regression that opens up the
    // matcher to /api routes is caught here rather than in production.
    const matcher = (config.matcher as string[])[0];
    expect(matcher).toMatch(/api/);
    expect(matcher).toMatch(/_next/);
  });
});
