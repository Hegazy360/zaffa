/**
 * Stable error-message strings the AI router uses to discriminate
 * paywall reasons. Mirrors the throw sites in
 * `src/server/routers/vision-packs.ts#requireActivePack`.
 *
 * The UI matches against the message string (not the code) because tRPC
 * funnels everything through `FORBIDDEN` and the message is the only
 * structured information the client sees.
 */
export const PACK_ERROR_REASONS = {
  REQUIRED: "PACK_REQUIRED",
  QUOTA_RENDERS: "PACK_QUOTA_RENDERS",
  QUOTA_VIDEOS: "PACK_QUOTA_VIDEOS",
  WINDOW_EXPIRED: "PACK_WINDOW_EXPIRED",
  /**
   * Anonymous-only: the per-IP free-render limiter rejected. Pops the
   * paywall so the visitor sees the upgrade options inline instead of
   * a dead-end toast. Not a true "pack" reason — it predates the user
   * ever owning a pack — but it routes through the same surface
   * because the resolution is identical (buy a pack to continue).
   */
  RATE_LIMITED_FREE: "FREE_RENDER_RATE_LIMITED",
} as const;

export type PackErrorReason =
  (typeof PACK_ERROR_REASONS)[keyof typeof PACK_ERROR_REASONS];

const REASONS = new Set<string>(Object.values(PACK_ERROR_REASONS));

/**
 * Extracts the pack-paywall reason from a tRPC error, or null if the
 * error is unrelated (we then fall through to the regular toast).
 */
export function parsePackError(err: unknown): PackErrorReason | null {
  if (!err || typeof err !== "object") return null;
  const message =
    "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : null;
  if (!message) return null;
  return REASONS.has(message) ? (message as PackErrorReason) : null;
}
