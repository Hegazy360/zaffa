import "server-only";
import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "./analytics-events";

// Server-side PostHog client. Used for:
//   - Server-evaluated feature flags (`isFlagEnabled` in `src/lib/flags.ts`).
//   - Backend event capture from cron jobs / webhooks where the browser
//     SDK can't reach.
//
// Returns `null` if PostHog isn't configured so callers can degrade gracefully
// (we never want analytics to break a request).
let cached: PostHog | null | undefined;

export function getPostHogServer(): PostHog | null {
  if (cached !== undefined) return cached;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
  if (!key) {
    cached = null;
    return null;
  }
  cached = new PostHog(key, {
    host,
    // Tighter flush than the SDK default — Vercel functions can be killed
    // quickly after returning a response, so we want events shipped fast.
    flushAt: 1,
    flushInterval: 0,
  });
  return cached;
}

/** Best-effort fire-and-forget capture from server code. Swallows errors. */
export async function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = getPostHogServer();
  if (!ph) return;
  try {
    ph.capture({ distinctId, event, properties });
    await ph.flush();
  } catch {
    // Analytics must never break a request.
  }
}

/**
 * Typed convenience for server-side captures from tRPC procedures, cron
 * jobs, and webhooks. Identical to `captureServer` but constrains `event`
 * to the canonical `ANALYTICS_EVENTS` set so call sites can't typo.
 */
export async function trackServer(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): Promise<void> {
  await captureServer(distinctId, event, properties);
}
