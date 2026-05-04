"use client";

import posthog from "posthog-js";
import type { AnalyticsEvent } from "./analytics-events";

// Thin client-side analytics wrapper. Every PostHog `capture` from a React
// component (or hook) goes through here so we have a single chokepoint to:
//   - enforce the typed event names from `analytics-events.ts`
//   - no-op when PostHog isn't configured (CI, tests, local without key)
//   - swallow errors so analytics can never break a render
//
// Server-side captures use `captureServer` from `@/lib/posthog` directly
// because they need an explicit distinctId (the browser SDK reads its own).
export function track(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never throw.
  }
}
