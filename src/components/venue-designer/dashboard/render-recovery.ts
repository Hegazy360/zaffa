/**
 * A render whose response never reached the tab may still have finished.
 *
 * The server keeps going when the connection drops (a phone that switches
 * to WhatsApp suspends the tab, and a dressed venue takes about a minute):
 * it writes the row and spends the render, and nothing tells the panel. So
 * when a render fails without a tRPC error code, the panel watches the
 * design for a render it did not know about when the couple pressed the
 * button, and shows that one instead of asking them to pay again.
 */

/** How often the design is refetched while a lost render may still land. */
export const RENDER_RECOVERY_POLL_MS = 10_000;

/**
 * How long to keep looking: the tRPC route's `maxDuration`, after which the
 * platform has killed the request and nothing more can land.
 */
export const RENDER_RECOVERY_WINDOW_MS = 300_000;

type RenderErrorShape = {
  data?: { code?: string; httpStatus?: number } | null;
} | null | undefined;

/**
 * True when the render failed without a tRPC answer: a dropped connection,
 * a suspended tab, a gateway timeout page. The server may have finished.
 * A coded error is the procedure's own verdict, and it throws before it
 * spends or writes anything.
 */
export function renderOutcomeUnknown(err: RenderErrorShape): boolean {
  return !err?.data?.code;
}

/**
 * Worth refetching the design and the pack after this failure: the outcome
 * is unknown, or the server faulted (5xx) rather than refusing the request.
 */
export function renderMayHaveLanded(err: RenderErrorShape): boolean {
  return renderOutcomeUnknown(err) || (err?.data?.httpStatus ?? 0) >= 500;
}

/**
 * The newest render the design holds that was not there at the click
 * (`getById` lists media newest first).
 */
export function findLandedRender<T extends { id: string; type: string }>(
  media: readonly T[],
  knownIds: ReadonlySet<string>,
): T | null {
  return media.find((m) => m.type === "render" && !knownIds.has(m.id)) ?? null;
}
