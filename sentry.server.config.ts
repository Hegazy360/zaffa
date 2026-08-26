// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://46efa0b6aa2fc2eb4baba74d769d25de@o4511332367269888.ingest.de.sentry.io/4511332368842832",

  // Matches the deliberate client-side decision in src/instrumentation-client.ts:
  // 100% tracing in production is a quota bonfire. These two configs sat at the
  // wizard default of 1 only because nothing imported them - they were dead
  // files until src/instrumentation.ts started loading them, so this is the
  // first time the value has ever meant anything. Dialled before it bites.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
