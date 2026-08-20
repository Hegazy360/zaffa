import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/env-checks";
import { logger, reportError } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Daily sweep of anonymous Supabase users that never confirmed an
 * email. Deletes the `auth.users` row through the admin API; the
 * cascade to `profiles` then unwinds free-tier `vision_packs`,
 * abandoned `venue_designs`, and `email_capture_events` via Prisma's
 * `onDelete: Cascade` relations.
 *
 * Retention window: 14 days. Long enough to catch a returning visitor
 * who confirmed the email a few days late, short enough that abuse
 * accumulation stays bounded. Anon users who DID upgrade
 * (`is_anonymous=false`) are never touched — the cleanup is keyed off
 * the mirrored flag on `profiles`.
 *
 * Configure in `vercel.json`:
 *   { "path": "/api/cron/cleanup-anon-users", "schedule": "0 3 * * *" }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 100;
const RETENTION_DAYS = 14;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);

  // Chat transcripts age out at 90 days — they exist as a prompt-tuning
  // corpus and an abuse trail, not a permanent record. Cascade removes
  // the messages. Rides this cron rather than its own entry because a
  // daily sweep is a daily sweep.
  const chatCutoff = new Date();
  chatCutoff.setUTCDate(chatCutoff.getUTCDate() - 90);
  const chatSwept = await prisma.chatConversation
    .deleteMany({ where: { last_message_at: { lt: chatCutoff } } })
    .catch((err: unknown) => {
      reportError("cron.cleanup_anon.chat_sweep_failed", err);
      return { count: 0 };
    });
  if (chatSwept.count > 0) {
    logger.info("cron.cleanup_anon.chat_swept", { count: chatSwept.count });
  }

  // Anon users that haven't claimed an email yet AND haven't even
  // hit the gate (no `free_render_email`). Email-claimed-but-not-
  // confirmed rows are also fair game because the lock falls away
  // with the row — a fresh visitor with the same email can try
  // again. The free-render uniqueness constraint is a fairness
  // signal, not a permanent ban.
  const stale = await prisma.profile.findMany({
    where: {
      is_anonymous: true,
      created_at: { lt: cutoff },
    },
    select: { id: true },
    take: BATCH,
  });

  if (stale.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, deleted: 0 });
  }

  const supabase = getSupabaseAdmin();
  let deleted = 0;
  for (const row of stale) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(row.id);
      if (error && !/not.?found/i.test(error.message)) {
        reportError("cron.cleanup_anon.delete_failed", error, {
          userId: row.id,
        });
        continue;
      }
      deleted += 1;
    } catch (err) {
      reportError("cron.cleanup_anon.unexpected", err, { userId: row.id });
    }
  }

  logger.info("cron.cleanup_anon.success", {
    processed: stale.length,
    deleted,
    cutoff: cutoff.toISOString(),
  });
  return NextResponse.json({
    ok: true,
    processed: stale.length,
    deleted,
  });
}
