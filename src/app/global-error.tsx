"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

/**
 * The last-resort error page — it replaces the root layout entirely.
 *
 * That is what makes it awkward: there is no `NextIntlClientProvider` above
 * it, so `useTranslations` would throw, and no root `<html>` either, so this
 * component owns `lang` and `dir`. The previous version hardcoded
 * `<html lang="en">` with no `dir`, which meant an Arabic visitor hitting a
 * catastrophic error got a left-to-right English page from Next's default
 * error component — the worst possible moment to also lose the language.
 *
 * The fix is to read the same `zaffa_locale` cookie the middleware sets, in an
 * effect (cookies are not available during the server render of this file),
 * and to carry a four-language copy table inline. Four short strings is a
 * reasonable price for a page that must work when every provider above it is
 * gone.
 */

const COPY = {
  en: {
    title: "Something went wrong.",
    body: "We have been told about it. Reloading usually fixes it.",
    action: "Reload",
    dir: "ltr",
  },
  ar: {
    title: "حصل خطأ ما.",
    body: "وصلنا الخبر، وإعادة التحميل بتحلّها في الغالب.",
    action: "أعيدوا التحميل",
    dir: "rtl",
  },
  fr: {
    title: "Une erreur est survenue.",
    body: "Nous en avons été informés. Recharger la page suffit généralement.",
    action: "Recharger",
    dir: "ltr",
  },
  de: {
    title: "Etwas ist schiefgelaufen.",
    body: "Wir wurden benachrichtigt. Ein Neuladen behebt es meistens.",
    action: "Neu laden",
    dir: "ltr",
  },
} as const;

type Locale = keyof typeof COPY;

function readLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/(?:^|;\s*)zaffa_locale=([^;]+)/);
  const value = match?.[1];
  return value && value in COPY ? (value as Locale) : "en";
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  // Server-render as `en`, then correct on mount. The alternative — reading
  // the cookie during render — would produce a hydration mismatch on every
  // non-English visit.
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    Sentry.captureException(error);
    // A one-shot read of the environment after mount, not a render-driven
    // update. The lint rule guards against cascading renders; this cannot
    // cascade, because `readLocale` has no React inputs and the effect runs
    // once per error. Reading the cookie during render instead would
    // hydrate-mismatch on every non-English visit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(readLocale());
  }, [error]);

  const copy = COPY[locale];

  return (
    <html lang={locale} dir={copy.dir}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fdf3f0",
          color: "#18181b",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        {/* Inline styles, not Tailwind: this boundary can render when the
            stylesheet itself failed to load, which is one of the ways a page
            ends up here in the first place. */}
        <div style={{ maxWidth: "32rem" }}>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 6,
              borderRadius: 999,
              margin: "0 auto 1.5rem",
              background: "linear-gradient(90deg, #e11d48, #f59e0b)",
            }}
          />
          <h1 style={{ fontSize: "1.5rem", fontWeight: 400, margin: 0 }}>
            {copy.title}
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#52525b", fontSize: "0.95rem" }}>
            {copy.body}
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.75rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "#71717a",
              }}
            >
              {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.5rem",
              border: "none",
              borderRadius: 999,
              padding: "0.75rem 1.75rem",
              fontSize: "0.95rem",
              color: "#fff",
              cursor: "pointer",
              background: "linear-gradient(90deg, #e11d48, #f59e0b)",
            }}
          >
            {copy.action}
          </button>
        </div>
      </body>
    </html>
  );
}
