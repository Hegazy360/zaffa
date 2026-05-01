import { match } from "@formatjs/intl-localematcher";
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  defaultLocale,
  isLocale,
  locales,
} from "@/i18n/config";

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
