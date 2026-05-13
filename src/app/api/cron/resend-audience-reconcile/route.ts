import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/env-checks";
import { logger, reportError } from "@/lib/logger";
import { addToAudience } from "@/lib/resend";

/**
 * Daily reconcile sweep for `email_capture_events` that didn't make
 * it into the Resend Audience on the inline `auth.requestEmailUpgrade`
 * call. The inline push can fail for a handful of reasons that don't
 * matter to the visitor (Resend API outage, transient rate-limit,
 * `RESEND_AUDIENCE_ID` only configured later) — the gate succeeds and
 * the email lock holds, but the address never made the nurture list.
 *
 * Selection criteria:
 *   - `status = 'pending'`             — push hasn't been confirmed
 *   - `resend_synced_at IS NULL`       — never made it across the wire
 *
 * On success we flip the row to `status='sent'` and stamp
 * `resend_synced_at`. The `/auth/confirm` route later flips
 * `status='confirmed'` once the magic link is actually clicked, so the
 * three states tell a story:
 *   pending  → gate submitted, Resend hasn't accepted yet
 *   sent     → in the Audience, magic link still in inbox
 *   confirmed → user upgraded; permanent account exists
 *
 * Configure in `vercel.json`:
 *   { "path": "/api/cron/resend-audience-reconcile", "schedule": "0 4 * * *" }
 *
 * Scheduled once a day because Vercel Hobby plans cap cron frequency
 * at daily. Inline push at capture time is still the primary path —
 * this cron is the retry safety net, so a 24-hour worst-case lag from
 * capture to Resend is fine. If we move to Pro/Enterprise the
 * schedule can be tightened to hourly (`0 * * * *`).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 100;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const due = await prisma.emailCaptureEvent.findMany({
    where: {
      status: "pending",
      resend_synced_at: null,
    },
    orderBy: { created_at: "asc" },
    take: BATCH,
    select: {
      id: true,
      email: true,
      country: true,
      design_id: true,
      render_id: true,
    },
  });

  if (due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, synced: 0 });
  }

  let synced = 0;
  let failed = 0;
  for (const row of due) {
    try {
      const ok = await addToAudience(row.email, {
        country: row.country ?? undefined,
        designId: row.design_id ?? undefined,
        renderId: row.render_id ?? undefined,
      });
      if (!ok) {
        // RESEND_AUDIENCE_ID still unconfigured. No point retrying
        // every minute — bail and let a future deploy that flips the
        // env var pick it back up.
        break;
      }
      await prisma.emailCaptureEvent.update({
        where: { id: row.id },
        data: { status: "sent", resend_synced_at: new Date() },
      });
      synced += 1;
    } catch (err) {
      failed += 1;
      reportError("cron.resend_reconcile.failed", err, { captureId: row.id });
    }
  }

  logger.info("cron.resend_reconcile.success", {
    processed: due.length,
    synced,
    failed,
  });
  return NextResponse.json({
    ok: true,
    processed: due.length,
    synced,
    failed,
  });
}
