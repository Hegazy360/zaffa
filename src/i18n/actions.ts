"use server";

import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  type Locale,
} from "./config";

// Single entry point for switching the active locale. We write the cookie
// here (server-side, so it sticks for SSR) and the caller is responsible
// for triggering a `router.refresh()` on the client to re-render with the
// new bundle. Keeping this thin avoids needing a tRPC roundtrip just to
// flip a cookie.
export async function setLocaleCookie(locale: Locale) {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}
