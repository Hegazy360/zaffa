import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/env-checks";
import { reportError } from "@/lib/logger";
import { runDiscovery } from "@/server/services/prospects/run-discovery";
import { DiscoveryRunStatus } from "@/generated/prisma/client";

// Vercel Cron tick. Configured in vercel.json to fire every minute. We
// process up to N queued runs per tick so a flood of admin "Run now"
// requests doesn't starve out the queue.
//
// Auth: every Vercel cron request carries `Authorization: Bearer <CRON_SECRET>`
// when CRON_SECRET is set in env. We mirror that here so `curl` from random
// IPs can't replay the endpoint.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PER_TICK = 3;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const queued = await prisma.discoveryRun.findMany({
    where: { status: DiscoveryRunStatus.queued },
    orderBy: { created_at: "asc" },
    take: MAX_PER_TICK,
    select: { id: true },
  });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const r of queued) {
    try {
      await runDiscovery(r.id);
      results.push({ id: r.id, ok: true });
    } catch (e) {
      reportError("cron.discovery_tick.run_failed", e, { runId: r.id });
      results.push({
        id: r.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}
