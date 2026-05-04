// Tiny structured logger + error reporter shim.
//
// Why not Sentry directly? We don't want to lock callers into a specific
// vendor before the team picks one. This module exposes a stable surface
// (`logger.info/.warn/.error`, `reportError`) that emits structured JSON
// to stdout/stderr today and can be re-wired to Sentry, Highlight, Axiom,
// or Datadog by editing only this file.
//
// Conventions:
//   - Always pass an event name as the first arg ("stripe.webhook.failed")
//     so logs are aggregable even before structured ingestion lands.
//   - Pass error + structured context in the second arg.
//   - The logger NEVER throws — observability bugs must not take down a
//     request handler.

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
 * Surface an unexpected error to the configured observability sink. Today
 * this is just a structured `console.error`; the moment we adopt Sentry
 * (or similar) this is the single function to swap.
 *
 * Always include `event` (a short dotted name) and `userId` if known so
 * the eventual ingest pipeline can route + dedupe properly.
 */
export function reportError(
  event: string,
  err: unknown,
  ctx?: LogContext,
): void {
  logger.error(event, err, ctx);
}
