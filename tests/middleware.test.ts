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
  delete process.env.FLAG_PROFESSIONAL_SURFACES;
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
  // NB: /dashboard/vendor used to be listed here, but it is now gated by
  // `professionalSurfaces` and 404s before the auth round-trip (that gate is
  // covered in its own describe block below). /dashboard/client stands in as
  // the auth-aware dashboard route.
  it.each([
    "/dashboard",
    "/dashboard/client",
    "/venue-designer",
    "/auth/signin",
  ])(
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
  it("seeds the locale cookie from Accept-Language when no country signal", async () => {
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
        headers: { "accept-language": "zh" },
        cookies: { zaffa_locale: "klingon" },
      })
    );
    expect(res.cookies.get("zaffa_locale")?.value).toBe("en"); // matched fallback
  });
});

describe("middleware: country-based locale seeding", () => {
  it("seeds `fr` for visitors from France regardless of Accept-Language", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: {
          "accept-language": "en-US,en;q=0.9",
          "x-vercel-ip-country": "FR",
        },
      })
    );
    expect(res.cookies.get("zaffa_locale")?.value).toBe("fr");
    expect(res.cookies.get("zaffa_country")?.value).toBe("FR");
  });

  it("seeds `ar` for visitors from Arabic-speaking countries", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: {
          "accept-language": "en-US",
          "x-vercel-ip-country": "EG",
        },
      })
    );
    expect(res.cookies.get("zaffa_locale")?.value).toBe("ar");
  });

  it("uses cf-ipcountry when x-vercel-ip-country is absent", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: { "cf-ipcountry": "SA" },
      })
    );
    expect(res.cookies.get("zaffa_locale")?.value).toBe("ar");
  });

  it("falls back to Accept-Language when the country doesn't map to a locale", async () => {
    // GB has no entry in COUNTRY_TO_LOCALE — visitor's Accept-Language wins.
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: {
          "accept-language": "fr-FR,fr;q=0.9",
          "x-vercel-ip-country": "GB",
        },
      })
    );
    expect(res.cookies.get("zaffa_locale")?.value).toBe("fr");
  });

  it("falls back to default locale when neither country nor Accept-Language map", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: {
          "accept-language": "zh-CN,zh;q=0.9",
          "x-vercel-ip-country": "GB",
        },
      })
    );
    expect(res.cookies.get("zaffa_locale")?.value).toBe("en");
  });

  it("seeds `de` for visitors from Germany", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: {
          "accept-language": "en-US",
          "x-vercel-ip-country": "DE",
        },
      })
    );
    expect(res.cookies.get("zaffa_locale")?.value).toBe("de");
  });

  it("respects an existing locale cookie even when the country would map differently", async () => {
    // A French user who explicitly switched to English keeps English.
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: { "x-vercel-ip-country": "FR" },
        cookies: { zaffa_locale: "en" },
      })
    );
    expect(res.cookies.get("zaffa_locale")).toBeUndefined();
  });

  it("uses an existing country cookie when no upstream geo header is present", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        cookies: { zaffa_country: "FR" },
      })
    );
    expect(res.cookies.get("zaffa_locale")?.value).toBe("fr");
  });

  it("ignores Cloudflare's `XX` (unknown) sentinel and falls through", async () => {
    const res = await middleware(
      buildRequest("https://app.test/", {
        headers: {
          "accept-language": "ar",
          "cf-ipcountry": "XX",
        },
      })
    );
    // Country signal is dropped → Accept-Language wins.
    expect(res.cookies.get("zaffa_locale")?.value).toBe("ar");
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

describe("middleware: professionalSurfaces flag", () => {
  // The pivot hides planner/vendor surfaces rather than deleting them
  // (docs/plan-pivot-2026-08.md Phase 0.2). These must 404 at the edge:
  // they're authenticated dashboards, so a `notFound()` inside the layout
  // would still be served behind a 200 status.
  it.each([
    "https://app.test/dashboard/planner",
    "https://app.test/dashboard/planner/proposals",
    "https://app.test/dashboard/vendor",
    "https://app.test/dashboard/vendor/catalog",
    "https://app.test/auth/signup/professional",
  ])("returns 404 for %s when the flag is off (default)", async (url) => {
    const res = await middleware(buildRequest(url));
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    // Gated before the Supabase round-trip — hiding these must not cost
    // an auth call.
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("does NOT gate the client or admin dashboards", async () => {
    for (const url of [
      "https://app.test/dashboard/client",
      "https://app.test/dashboard/admin",
    ]) {
      updateSessionMock.mockClear();
      const res = await middleware(
        buildRequest(url, { cookies: { zaffa_locale: "en" } })
      );
      expect(res.status).toBe(200);
      // These stay auth-aware.
      expect(updateSessionMock).toHaveBeenCalled();
    }
  });

  it("does NOT gate ordinary signup", async () => {
    const res = await middleware(
      buildRequest("https://app.test/auth/signup", {
        cookies: { zaffa_locale: "en" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("lets the professional surfaces through when the flag is on", async () => {
    process.env.FLAG_PROFESSIONAL_SURFACES = "true";
    const res = await middleware(
      buildRequest("https://app.test/dashboard/planner", {
        cookies: { zaffa_locale: "en" },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("middleware: the dev-only kitchen sink", () => {
  afterEach(() => vi.unstubAllEnvs());

  // `/kitchen-sink` guards itself with `notFound()` on NODE_ENV, and that
  // guard works — production served none of its content. It answered **200**
  // anyway, because a middleware response's status takes precedence over a
  // page's `notFound()`. A soft 404 is worse than a hard one: it is
  // indexable, and it tells a crawler the URL is real. Caught by checking
  // production after the deploy rather than by trusting the guard.
  it("404s in production", async () => {
    // `vi.stubEnv` rather than assignment: `process.env.NODE_ENV` is typed
    // read-only, so a direct write passes at runtime and fails typecheck.
    vi.stubEnv("NODE_ENV", "production");
    const res = await middleware(buildRequest("https://app.test/kitchen-sink"));
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("is reachable outside production, where it is the point", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await middleware(
      buildRequest("https://app.test/kitchen-sink", {
        cookies: { zaffa_locale: "en" },
      })
    );
    expect(res.status).toBe(200);
  });
});
