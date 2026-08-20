import "server-only";
import { envOverride, KNOWN, type FlagKey } from "@/lib/flags";
import { getPostHogServer } from "@/lib/posthog";

// Server-only flag API that consults PostHog when a `distinctId` is
// available. Kept in its own module so the synchronous `flags.ts` API
// stays free of `posthog-node` (which uses `node:async_hooks` + `node:fs`
// and can't be bundled for the browser).

// Mirrors `DEFAULTS` in flags.ts. Typed as a total Record so adding a flag
// there is a compile error here until it's mirrored — which is how the
// omission of `professionalSurfaces` was caught.
const DEFAULTS_FOR_FALLBACK: Record<FlagKey, boolean> = {
  publicBrowse: false,
  plannerVerification: true,
  onboardingWizard: true,
  professionalSurfaces: false,
  testimonials: false,
  publishedPricing: true,
  aiChat: false,
};

/**
 * Async flag check. Resolution order:
 *   1. `FLAG_<KEY>` env override (always wins).
 *   2. PostHog `isFeatureEnabled(KEY, distinctId)` when configured.
 *   3. Static fallback default.
 *
 * Never throws — analytics outages must not break a request.
 */
export async function isFlagEnabledFor(
  key: FlagKey,
  distinctId: string,
): Promise<boolean> {
  const fromEnv = envOverride(key);
  if (fromEnv != null) return fromEnv;

  const ph = getPostHogServer();
  if (ph) {
    try {
      const result = await ph.isFeatureEnabled(KNOWN[key], distinctId);
      if (typeof result === "boolean") return result;
    } catch {
      // Swallow — fall through to static default.
    }
  }
  return DEFAULTS_FOR_FALLBACK[key];
}
