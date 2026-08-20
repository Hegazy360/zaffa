// Cloudflare Turnstile server-side verification.
//
// Wraps the `/turnstile/v0/siteverify` endpoint with a sane default:
// **when no secret is configured we return `true`** so local dev and
// preview deploys stay unblocked. Production should always set both
// `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (rendered into the widget) and
// `TURNSTILE_SECRET_KEY` (used here) so the gate actually closes.
//
// We hit Cloudflare from the server only, the token is single-use and
// must be validated before granting the action it protects (an
// anonymous render here). On a verification failure we surface a
// machine-readable code so the tRPC procedure can map it to a tidy
// "please refresh and try again" error.

import { logger } from "@/lib/logger";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  ok: boolean;
  /** Cloudflare's machine-readable error codes when ok=false. */
  errors?: string[];
}

/**
 * Verify a Turnstile token against Cloudflare's siteverify endpoint.
 *
 * - Returns `{ ok: true }` immediately when no secret is set
 *   (dev/preview pass-through).
 * - Returns `{ ok: false }` when the secret IS set but the token is
 *   missing, production must always send a token.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteip?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { ok: true };
  }
  if (!token) {
    return { ok: false, errors: ["missing-input-response"] };
  }
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteip) body.set("remoteip", remoteip);
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    const json = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (json.success) return { ok: true };
    return { ok: false, errors: json["error-codes"] ?? ["unknown"] };
  } catch (err) {
    logger.warn("turnstile.verify.exception", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail open on Cloudflare network blips, Turnstile is defense in
    // depth, not the primary rate-limit. The IP+email limiters still
    // apply.
    return { ok: true };
  }
}
