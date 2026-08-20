import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * One-click unsubscribe tokens for the email footer.
 *
 * A token encodes `<userId>.<issuedAtMs>` and a base64url HMAC-SHA256
 * signature using `NOTIFICATION_UNSUBSCRIBE_SECRET`. The route at
 * `/api/unsubscribe` verifies the signature, checks the token isn't
 * ancient (tokens older than 90 days are rejected so a leaked mail doesn't
 * expose the account forever), and flips Profile.email_unsubscribed_at.
 *
 * We deliberately avoid JWT libraries, the payload is trivially small and
 * a bare HMAC keeps us one dependency lighter.
 */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const s = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "NOTIFICATION_UNSUBSCRIBE_SECRET is missing or too short (need >=16 chars)",
    );
  }
  return s;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signUnsubscribeToken(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest();
  return `${base64url(Buffer.from(payload))}.${base64url(sig)}`;
}

export function verifyUnsubscribeToken(token: string): { userId: string } | null {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return null;
    const payload = fromBase64url(payloadB64).toString("utf8");
    const [userId, issuedAtStr] = payload.split(".");
    if (!userId || !issuedAtStr) return null;
    const issuedAt = Number(issuedAtStr);
    if (!Number.isFinite(issuedAt)) return null;
    if (Date.now() - issuedAt > MAX_AGE_MS) return null;

    const expected = createHmac("sha256", getSecret()).update(payload).digest();
    const got = fromBase64url(sigB64);
    if (expected.length !== got.length) return null;
    if (!timingSafeEqual(expected, got)) return null;

    return { userId };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(baseUrl: string, userId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/unsubscribe?token=${encodeURIComponent(
    signUnsubscribeToken(userId),
  )}`;
}
