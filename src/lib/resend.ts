import { Resend } from "resend";
import { logger } from "@/lib/logger";

// The Resend SDK instance. All transactional mail goes through this.
// Notifications and other app-layer emails should prefer the wrappers in
// `src/server/services/notifications` (which handle locale, unsubscribe,
// and templating); this export stays for any one-off operational mail
// that doesn't fit the notification pipeline.
export const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Push an email address into the Resend Audience used for nurture
 * sequences. Returns `true` when Resend accepted the contact (new or
 * duplicate), `false` when the integration isn't configured. Throws on
 * an unexpected SDK error so the caller can decide to log + retry.
 *
 * Per the email-gate flow we deliberately do NOT collect first/last
 * name at submit time, the gate is single-field. Names can be
 * back-filled from `auth.users.email` / a follow-up form later.
 *
 * Resend Audiences treats duplicate `contacts.create` calls with the
 * same email as a no-op (no error), so this is idempotent enough for
 * the cron-driven reconcile path.
 */
export async function addToAudience(
  email: string,
  meta: { country?: string; designId?: string; renderId?: string } = {},
): Promise<boolean> {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!audienceId) {
    // No audience configured, common in dev/preview environments.
    // Caller logs the capture event for later reconciliation when the
    // env var is added.
    return false;
  }
  try {
    await resend.contacts.create({
      email,
      audienceId,
      unsubscribed: false,
      // first/last name intentionally omitted, see header comment.
    });
    void meta; // Currently unused, see header comment about future
    // segmentation. Kept on the signature so callers don't churn when
    // we add Resend tags.
    return true;
  } catch (err) {
    logger.warn("resend.audience.create_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
