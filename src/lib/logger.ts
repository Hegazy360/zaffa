// Tiny structured logger + error reporter shim.
//
// Why not Sentry directly? We don't want to lock callers into a specific
// vendor. This module exposes a stable surface (`logger.info/.warn/.error`,
// `reportError`) that emits structured JSON to stdout/stderr and fans out
// to whichever sink we happen to be paying for. Swapping Sentry for
// Highlight, Axiom or Datadog means editing this file and nothing else,
// which is the whole point of the seam: all 34 call sites keep importing
// `reportError` from "@/lib/logger" with an unchanged signature.
//
// The sink that seam was built for is now attached. Until it was, every
// server-side error in the app terminated at a console.error in a Vercel
// runtime log nobody tails, which is how the image render funnel stayed
// dead for five weeks (2026-07-21 to 2026-08-26) without anyone noticing.
// stdout is kept as well as Sentry, not replaced by it, so we still have a
// record when Sentry is down or over quota.
//
// Conventions:
//   - Always pass an event name as the first arg ("stripe.webhook.failed")
//     so logs are aggregable even before structured ingestion lands.
//   - Pass error + structured context in the second arg.
//   - The logger NEVER throws, observability bugs must not take down a
//     request handler.

import * as Sentry from "@sentry/nextjs";

type Level = "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function emit(level: Level, event: string, ctx?: LogContext, err?: unknown) {
  try {
    const payload: Record<string, unknown> = {
      level,
      event,
      ts: new Date().toISOString(),
      ...(ctx ?? {}),
    };
    if (err) {
      payload.error = serializeError(err);
    }
    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  } catch {
    // Fall back to plain console if JSON serialization throws (e.g. cyclic).
    if (err) console.error(`[${level}] ${event}`, err);
    else console.log(`[${level}] ${event}`, ctx);
  }
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      // Cause may carry more useful detail for wrapped errors
      cause:
        err.cause && err.cause !== err
          ? serializeError(err.cause)
          : undefined,
    };
  }
  if (typeof err === "object" && err !== null) {
    return { value: err as Record<string, unknown> };
  }
  return { value: String(err) };
}

export const logger = {
  info(event: string, ctx?: LogContext) {
    emit("info", event, ctx);
  },
  warn(event: string, ctx?: LogContext) {
    emit("warn", event, ctx);
  },
  error(event: string, err: unknown, ctx?: LogContext) {
    emit("error", event, ctx, err);
  },
};

/**
 * Surface an unexpected error to the configured observability sinks: a
 * structured `console.error` on stdout, and Sentry.
 *
 * Always include `event` (a short dotted name) and `userId` if known so
 * the ingest pipeline can route + dedupe properly.
 *
 * `event` is sent as a Sentry TAG rather than buried in the context. Sentry
 * groups by stack trace by default, which would throw away the dotted names
 * this codebase already maintains ("trpc.handler.error",
 * "stripe.webhook.failed") - the very thing the first argument exists for.
 * As a tag it stays searchable and usable as an alert condition.
 *
 * Several call sites pass values that aren't Errors. Sentry renders those as
 * "Non-Error exception captured" and groups them badly, so they get wrapped
 * in a real Error carrying the original as `cause`. serializeError() below
 * already walks `cause`, so the stdout line is unaffected either way.
 *
 * Note this only reports if Sentry actually initialised for the current
 * runtime. With no client bound to the scope, captureException silently
 * returns an event id and drops the event - which was the state of this app
 * until src/instrumentation.ts started importing the server and edge
 * configs. Do not separate those two changes.
 */
export function reportError(
  event: string,
  err: unknown,
  ctx?: LogContext,
): void {
  logger.error(event, err, ctx);
  try {
    const captured =
      err instanceof Error ? err : new Error(event, { cause: err });
    Sentry.captureException(captured, {
      tags: { event },
      extra: ctx,
      ...(typeof ctx?.userId === "string" ? { user: { id: ctx.userId } } : {}),
    });
  } catch {
    // Observability must never take down a request handler (see header).
    // captureException is non-throwing by design, but the never-throws
    // contract is explicit and this guard costs nothing.
  }
}
