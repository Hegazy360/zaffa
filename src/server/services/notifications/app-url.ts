/**
 * Resolve the canonical base URL for the current deployment. Used to build
 * absolute CTA links inside transactional emails. Order of precedence:
 *
 *   1. NEXT_PUBLIC_APP_URL              (explicit override, required when
 *                                        you're on a custom domain not yet
 *                                        registered in Vercel, or you want
 *                                        emails from preview builds to link
 *                                        to production on purpose).
 *   2. VERCEL_PROJECT_PRODUCTION_URL    (auto-set on Vercel to the stable
 *                                        production domain, custom domain
 *                                        if one is attached, otherwise the
 *                                        `<project>.vercel.app` URL). This
 *                                        is what we want for email links so
 *                                        they outlive any single deployment.
 *   3. VERCEL_URL                       (auto-set to the per-deployment URL,
 *                                        e.g. `<project>-git-branch-<hash>
 *                                        .vercel.app`). Fine for preview
 *                                        smoke-tests, not durable enough
 *                                        for production emails.
 *   4. http://localhost:3000            (local dev fallback).
 *
 * Always trims trailing slashes so callers can safely concatenate with
 * relative paths.
 */
export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return withProtocol(stripSlash(explicit));
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${stripSlash(vercelProd)}`;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${stripSlash(vercel)}`;
  return "http://localhost:3000";
}

// Accept `zaffa.ai` and `https://zaffa.ai` alike in NEXT_PUBLIC_APP_URL so a
// missing scheme doesn't silently produce broken links.
function withProtocol(v: string): string {
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

export function absoluteUrl(path: string | null | undefined): string {
  if (!path) return appBaseUrl();
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = appBaseUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function stripSlash(v: string): string {
  return v.endsWith("/") ? v.slice(0, -1) : v;
}
