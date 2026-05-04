import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/env-checks";
import { logger, reportError } from "@/lib/logger";
import { hardDeleteUser } from "@/server/routers/account";

/**
 * Daily sweep of accounts whose grace period has elapsed. Deletes each
 * matching `auth.users` row through the Supabase admin API; the cascade
 * to `profiles` then unwinds the rest of the user's data via Prisma's
 * `onDelete: Cascade` relations.
 *
 * Configure in `vercel.json`:
 *   { "path": "/api/cron/hard-delete-accounts", "schedule": "0 2 * * *" }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 50;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const due = await prisma.profile.findMany({
    where: {
      deletion_scheduled_for: { lte: new Date() },
    },
    select: { id: true },
    take: BATCH,
  });
  let deleted = 0;
  for (const row of due) {
    try {
      await hardDeleteUser(row.id);
      deleted += 1;
    } catch (err) {
      reportError("cron.hard_delete.failed", err, { userId: row.id });
    }
  }
  logger.info("cron.hard_delete.success", { processed: due.length, deleted });
  return NextResponse.json({ ok: true, processed: due.length, deleted });
}
