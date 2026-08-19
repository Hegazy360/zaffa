import { match } from "@formatjs/intl-localematcher";
import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  defaultLocale,
  isLocale,
  locales,
  localeForCountry,
} from "@/i18n/config";
import { isFlagEnabled } from "@/lib/flags";
import {
  VISION_PACK_COUNTRY_COOKIE,
  normalizeCountryCode,
} from "@/lib/vision-pack-pricing";

// 1 year — country doesn't change often, and a stale entry only impacts
// pricing display (the resolved price is computed server-side per-request,
// so a cookie outliving a real geo move just delays the price update by
// at most one cookie cycle).
const COUNTRY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Routes the `publicBrowse` flag controls. When the flag is off, anything
// matching this regex is rejected at the edge with a real 404 — calling
// `notFound()` from the page itself ends up rendering the not-going-live UI with
// the response status the middleware set (200), so we short-circuit at the
// edge to get the correct status code on the wire.
const PUBLIC_BROWSE_ROUTE = /^\/(planners|vendors)(\/.*)?$/;

// Planner/vendor-facing surfaces, hidden by the `professionalSurfaces` flag.
// Same edge-404 treatment and the same reason: these are authenticated
// dashboards, so `notFound()` inside the layout would still render behind a
// 200. Kept as a separate regex from PUBLIC_BROWSE_ROUTE because the two
// flags are independent — public browse is about SEO acquisition, this is
// about the pivot to a client-only product.
const PROFESSIONAL_ROUTE =
  /^\/(dashboard\/(planner|vendor)|auth\/signup\/professional)(\/.*)?$/;

// Paths whose middleware behaviour actually depends on the Supabase session:
//   - /dashboard/*       → redirect to signin when unauthenticated
//   - /venue-designer/*  → redirect to signin when unauthenticated
//   - /auth/*            → redirect away to dashboard when already signed in
//                          (except /auth/reset-password, which the recovery
//                          flow needs to reach with a temporary session)
// Every other route — marketing, public browse, sitemaps, robots, error
// pages — can skip the `supabase.auth.getUser()` round-trip entirely.
// Keeping this in sync with `updateSession` is the only correctness
// requirement; if you add a gated route there, add it here too.
const AUTH_AWARE_ROUTE = /^\/(dashboard|venue-designer|auth)(\/.*)?$/;

// Pre-launch gate. When `SITE_PASSWORD` is set we require HTTP Basic Auth on
// every HTML route so the app can be attached to a custom domain without
// exposing it to the public yet. Unset → no gate (so local dev just works).
// Username defaults to "preview" if `SITE_USERNAME` isn't set.
function checkSitePassword(request: NextRequest): NextResponse | null {
  const password = process.env.SITE_PASSWORD;
  if (!password) return null;
  const expectedUser = process.env.SITE_USERNAME || "preview";

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [user, ...rest] = atob(header.slice(6)).split(":");
      if (user === expectedUser && rest.join(":") === password) return null;
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Zaffa preview", charset="UTF-8"',
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

// Tiny inline 404 body so a human visiting still sees something sensible
// rather than a blank page. We can't render a React server component from
// here, so this is hand-rolled. Kept short on purpose.
const HIDDEN_ROUTE_404_BODY = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>Page not found · Zaffa</title>
<style>
  body{margin:0;display:grid;min-height:100vh;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafaf9;color:#1c1917}
  main{text-align:center;max-width:28rem;padding:2rem}
  h1{margin:0 0 .5rem;font-size:3.75rem;font-weight:700;background:linear-gradient(90deg,#e11d48,#f59e0b);-webkit-background-clip:text;background-clip:text;color:transparent}
  h2{margin:0 0 .75rem;font-size:1.25rem;font-weight:600}
  p{margin:0 0 1.5rem;color:#57534e;font-size:.95rem}
  a{display:inline-block;padding:.6rem 1.1rem;border-radius:9999px;background:#1c1917;color:#fafaf9;text-decoration:none;font-size:.875rem}
</style>
</head><body><main>
<h1>404</h1>
<h2>Page not found</h2>
<p>The page you're looking for doesn't exist.</p>
<a href="/">Go home</a>
</main></body></html>`;

// Parse an Accept-Language header into an ordered list of language tags.
// We don't pull in `negotiator` — Accept-Language is simple enough that a
// 5-line parser is cheaper than a dep.
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim(), q: q ? parseFloat(q) : 1 };
    })
    .filter((p) => p.tag.length > 0)
    .sort((a, b) => b.q - a.q)
    .map((p) => p.tag);
}

export async function middleware(request: NextRequest) {
  // Pre-launch site password — runs before everything else so unauthenticated
  // visitors never touch supabase or downstream services.
  const gated = checkSitePassword(request);
  if (gated) return gated;

  // Edge gate for the public browse routes. We do this *before* the supabase
  // session round-trip so an unauthenticated bot scraping `/vendors` is cheap
  // to reject. Returns a real 404 status code (the page-level `notFound()`
  // alone returns 200 because the middleware response status takes precedence
  // over the page's `notFound()` short-circuit).
  if (
    !isFlagEnabled("publicBrowse") &&
    PUBLIC_BROWSE_ROUTE.test(request.nextUrl.pathname)
  ) {
    return new NextResponse(HIDDEN_ROUTE_404_BODY, {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  if (
    !isFlagEnabled("professionalSurfaces") &&
    PROFESSIONAL_ROUTE.test(request.nextUrl.pathname)
  ) {
    return new NextResponse(HIDDEN_ROUTE_404_BODY, {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  // The Supabase session round-trip costs 100–500ms and is only needed
  // for the auth-aware routes above. Everything else (marketing, sitemap,
  // robots, /api/* — though /api/* is excluded by the matcher anyway) can
  // skip it. Big TTFB win for the marketing home and other public pages.
  const response = AUTH_AWARE_ROUTE.test(request.nextUrl.pathname)
    ? await updateSession(request)
    : NextResponse.next({ request });

  // Resolve the visitor's country from the upstream geo signal. Read
  // order:
  //   - Vercel: `request.geo.country` (production), `x-vercel-ip-country`
  //   - Cloudflare: `cf-ipcountry`
  //   - Cookie set on a previous hit (handles requests that skip past
  //     the edge geo enrichment, e.g. local dev with a manually-seeded
  //     cookie).
  // We compute this once here because both locale seeding (below) and
  // the Vision Pack pricing cookie (further below) need it.
  const existingCountry = normalizeCountryCode(
    request.cookies.get(VISION_PACK_COUNTRY_COOKIE)?.value,
  );
  const detectedCountry =
    normalizeCountryCode(
      // request.geo is Vercel-specific; tolerate environments without it.
      (request as NextRequest & { geo?: { country?: string } }).geo?.country ??
        request.headers.get("x-vercel-ip-country") ??
        request.headers.get("cf-ipcountry"),
    ) ?? existingCountry;

  // Seed the locale cookie on first hit so server renders + the request
  // config helper always have a concrete locale to read. Priority:
  //   1. Country signal → mapped locale (FR → fr, EG/SA/AE/… → ar, …)
  //      This is the explicit product behaviour: a visitor in France
  //      sees French by default, a visitor in an Arab country sees
  //      Arabic, everyone else falls through.
  //   2. Accept-Language match → handles cross-border travellers and
  //      countries we don't map (an Arabic speaker in Germany still
  //      gets Arabic).
  //   3. Default locale (English).
  // The user can override at any time via the navbar switcher, which
  // writes a valid locale into the cookie; this block only runs when
  // the cookie is missing or unrecognised, so the switch is sticky.
  const existing = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!isLocale(existing)) {
    const countryLocale = localeForCountry(detectedCountry);
    let chosen: string;
    if (countryLocale) {
      chosen = countryLocale;
    } else {
      const acceptLanguage = request.headers.get("accept-language") ?? "";
      const requested = parseAcceptLanguage(acceptLanguage);
      try {
        chosen = match(
          requested.length > 0 ? requested : [defaultLocale],
          locales as unknown as string[],
          defaultLocale,
        );
      } catch {
        chosen = defaultLocale;
      }
    }
    response.cookies.set(LOCALE_COOKIE, chosen, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  // Persist the country cookie when the upstream signal disagrees with
  // what's stored (e.g. user moved networks). Skip the write when
  // nothing changed to avoid a cache-bust on every hit. Vision Pack
  // pricing reads this cookie server-side per request.
  if (detectedCountry && detectedCountry !== existingCountry) {
    response.cookies.set(VISION_PACK_COUNTRY_COOKIE, detectedCountry, {
      path: "/",
      maxAge: COUNTRY_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  // We need to seed the cookie on the marketing surface too, so the matcher
  // covers everything except Next internals and static assets.
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"],
};
