// Sentry on the client.
//
// This was the wizard's default config, and two of its defaults are very
// expensive on the surface that matters most here — a marketing homepage
// opened on a phone, on cellular, in the Gulf:
//
//   1. `replayIntegration()` pulls Session Replay into the first load. It is
//      the single heaviest thing in the client bundle after React itself,
//      and it was shipping to every visitor to record 10% of them. Errors are
//      still captured; only the video-like replay is gone. Re-enable by
//      adding the integration back if a bug ever needs it — preferably via
//      `Sentry.lazyLoadIntegration("replayIntegration")` so it stays out of
//      the initial download.
//   2. `tracesSampleRate: 1` traced 100% of transactions in production. That
//      is a lot of beacons from every visitor and a Sentry bill to match;
//      10% is plenty to spot a regression, and development keeps 100%.
//
// `sendDefaultPii` is left as the wizard set it, but flagged: it sends
// personally identifying request data to Sentry, which is worth a deliberate
// decision on a platform holding couples' details under EU jurisdiction.

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: "https://46efa0b6aa2fc2eb4baba74d769d25de@o4511332367269888.ingest.de.sentry.io/4511332368842832",

  tracesSampleRate: isProd ? 0.1 : 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
