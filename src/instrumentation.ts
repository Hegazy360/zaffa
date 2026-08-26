// Next.js boot hook. Runs once per server process before any requests are
// handled. We use it to:
//   1. Initialise server-side and edge observability
//   2. Refuse to start a production server with missing critical env vars
//
// Why the Sentry imports are here at all: they were missing for the entire
// life of the Sentry install. This file was created first, by the launch
// hardening pass, and when the Sentry wizard ran later it found something
// already sitting at this path and declined to merge into it. It scaffolded
// sentry.server.config.ts and sentry.edge.config.ts at the repo root, wired
// next.config.ts and the client, and left both server configs importable by
// nobody. Sentry.init() therefore never ran outside the browser, so every
// server error the app has ever thrown went to stdout and nowhere else.
// That is how the image render funnel could stay dead from 2026-07-21 to
// 2026-08-26 without a single alert: the errors were being reported, to a
// log stream no one tails.
//
// Two details that are easy to get wrong and were both wrong before:
//
//   - The config files live at the REPO ROOT while this file lives under
//     src/, so the paths are "../sentry.*.config", not the "./" the Sentry
//     docs show. "./" resolves to src/sentry.server.config and fails.
//   - `onRequestError` must be a top-level named export. Next discovers it
//     by name and hands it errors from Server Components, route handlers,
//     middleware and proxies. Importing the configs without this export
//     gives you an SDK that looks initialised and still drops that entire
//     class of error. (tRPC is a separate path again: its own onError
//     handler catches before Next ever sees the throw, which is why
//     reportError() in src/lib/logger.ts also forwards to Sentry.)
//
// The top-level `import * as Sentry` is deliberate and safe in both
// runtimes. @sentry/nextjs declares an "edge" export condition, so the edge
// build resolves to its own entry point rather than dragging Node code in.
// The runtime configs themselves stay behind NEXT_RUNTIME checks so each
// process only initialises its own.
//
// See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Sentry first, so a boot failure from the env assertion below is itself
    // reportable rather than another error that only exists in stdout.
    await import("../sentry.server.config");
    const { assertProductionEnv } = await import("./lib/env-checks");
    assertProductionEnv();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
