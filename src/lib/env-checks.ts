// Centralized startup-time guards for env vars whose absence is fatal in
// production but acceptable in dev. Imported from `instrumentation.ts` so
// the app refuses to boot with a misconfigured environment.

const PROD_REQUIRED = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "CRON_SECRET",
  "NOTIFICATION_UNSUBSCRIBE_SECRET",
] as const;

// Pairs of either-or env vars. At least one name per pair must be set.
// Used for credentials that can be provisioned under multiple names
// depending on whether you pulled them manually from the Upstash
// console (UPSTASH_*) or from the Vercel Marketplace integration
// (KV_REST_API_*).
const PROD_REQUIRED_EITHER: Array<[string, string]> = [
  ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"],
  ["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"],
];

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing: string[] = PROD_REQUIRED.filter((k) => !process.env[k]);
  for (const [a, b] of PROD_REQUIRED_EITHER) {
    if (!process.env[a] && !process.env[b]) missing.push(`${a} (or ${b})`);
  }
  if (missing.length > 0) {
    const joined = missing.join(", ");
    throw new Error(
      `[zaffa] Refusing to boot - missing required production env vars: ${joined}`,
    );
  }
}

/**
 * Returns true when the current request should be allowed past a cron
 * authorization check. Fails closed in production: if `CRON_SECRET` isn't
 * configured, no request is accepted. In dev / preview we accept any
 * caller so local debugging works.
 */
export function isAuthorizedCronRequest(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const got = req.headers.get("authorization") ?? "";
  return got === `Bearer ${expected}`;
}
