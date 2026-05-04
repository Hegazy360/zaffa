// Synchronous, env-only feature flag API. Safe to import from anywhere
// (server components, client components, edge runtime) — has zero runtime
// dependencies beyond `process.env`.
//
// For per-user PostHog evaluation use `isFlagEnabledFor` from
// `@/lib/flags-server` (server-only because it pulls in the PostHog Node
// SDK + `server-only` guard).
//
// Resolution order, in priority:
//   1. Env-var override `FLAG_<UPPER_SNAKE>` (always wins; lets us hard-flip
//      a flag from Vercel settings without touching PostHog).
//   2. The hard-coded `DEFAULTS` below.
//
// Naming: `FLAG_<UPPER_SNAKE>`. Defaults are kept conservative — flipping a
// flag off should always be the safer choice in case PostHog is unreachable.

export const FLAG_PREFIX = "FLAG_";

export const KNOWN = {
  // Public planner / vendor browse pages. Currently OFF — exposes the
  // commercially sensitive vendor catalog (pricing, portfolios) and the
  // full planner directory unauthenticated. Flip on (env override or
  // PostHog) once we want SEO-driven acquisition.
  publicBrowse: "PUBLIC_BROWSE",
  // Admin verification toggle — flip off to hide the new toggle in
  // /dashboard/admin/users/[id] without redeploying.
  plannerVerification: "PLANNER_VERIFICATION",
  // Onboarding wizard for planners + vendors. Off = old setup-needed
  // splash, on = multi-step wizard.
  onboardingWizard: "ONBOARDING_WIZARD",
} as const;

export type FlagKey = keyof typeof KNOWN;

const DEFAULTS: Record<FlagKey, boolean> = {
  // OFF — see comment on `publicBrowse` above.
  publicBrowse: false,
  plannerVerification: true,
  onboardingWizard: true,
};

export function parseFlagValue(value: string | undefined): boolean | null {
  if (value == null) return null;
  const v = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(v)) return true;
  if (["0", "false", "off", "no"].includes(v)) return false;
  return null;
}

export function envOverride(key: FlagKey): boolean | null {
  const envName = `${FLAG_PREFIX}${KNOWN[key]}`;
  return parseFlagValue(process.env[envName]);
}

/**
 * Synchronous flag check — env override or static default only.
 * Use this in code paths that can't await (React render trees, hot loops).
 * For per-user / segmented rollouts, prefer `isFlagEnabledFor` from
 * `@/lib/flags-server`.
 */
export function isFlagEnabled(key: FlagKey): boolean {
  const fromEnv = envOverride(key);
  if (fromEnv != null) return fromEnv;
  return DEFAULTS[key];
}

/** All known flag keys (for debugging dashboards or admin UIs). */
export function listFlags(): Array<{ key: FlagKey; enabled: boolean }> {
  return (Object.keys(KNOWN) as FlagKey[]).map((key) => ({
    key,
    enabled: isFlagEnabled(key),
  }));
}
