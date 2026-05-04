import { match } from "@formatjs/intl-localematcher";
import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  defaultLocale,
  isLocale,
  locales,
} from "@/i18n/config";
import { isFlagEnabled } from "@/lib/flags";

// Routes the `publicBrowse` flag controls. When the flag is off, anything
// matching this regex is rejected at the edge with a real 404 — calling
// `notFound()` from the page itself ends up rendering the not-found UI with
// the response status the middleware set (200), so we short-circuit at the
// edge to get the correct status code on the wire.
const PUBLIC_BROWSE_ROUTE = /^\/(planners|vendors)(\/.*)?$/;

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

  const response = await updateSession(request);

  // Seed the locale cookie on first hit so server renders + the request
  // config helper always have a concrete locale to read. We negotiate from
  // Accept-Language so the user lands in their preferred language out of
  // the box.
  const existing = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!isLocale(existing)) {
    const acceptLanguage = request.headers.get("accept-language") ?? "";
    const requested = parseAcceptLanguage(acceptLanguage);
    let chosen: string = defaultLocale;
    try {
      chosen = match(
        requested.length > 0 ? requested : [defaultLocale],
        locales as unknown as string[],
        defaultLocale,
      );
    } catch {
      chosen = defaultLocale;
    }
    response.cookies.set(LOCALE_COOKIE, chosen, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
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
