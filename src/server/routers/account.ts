import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reportError } from "@/lib/logger";
import { enforceTrpc } from "@/lib/rate-limit";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

// Soft-delete grace period. The user can sign back in within this window
// to cancel the deletion; after it elapses, the cron worker hard-deletes
// the account.
const GRACE_PERIOD_DAYS = 14;

export const accountRouter = router({
  // Returns the current deletion-request state so settings UIs can render
  // the right CTA + countdown.
  deletionStatus: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.profile.findUnique({
      where: { id: ctx.user.id },
      select: {
        deletion_requested_at: true,
        deletion_scheduled_for: true,
      },
    });
    if (!profile) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return {
      requestedAt: profile.deletion_requested_at,
      scheduledFor: profile.deletion_scheduled_for,
    };
  }),

  // Stamps the soft-delete timestamps. The user remains signed in and can
  // call `cancelDeletion` from settings to stop the process. We do NOT
  // sign them out here — leaving them in lets them undo with one click.
  requestDeletion: protectedProcedure
    .input(
      z
        .object({
          confirmText: z.string().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx }) => {
      await enforceTrpc("authPasswordReset", ctx.user.id);
      const now = new Date();
      const scheduled = new Date(now);
      scheduled.setUTCDate(scheduled.getUTCDate() + GRACE_PERIOD_DAYS);
      await prisma.profile.update({
        where: { id: ctx.user.id },
        data: {
          deletion_requested_at: now,
          deletion_scheduled_for: scheduled,
        },
      });
      // Account-hygiene funnel — useful for retention analysis (how many
      // users come back to cancel within the grace window).
      await trackServer(
        ctx.user.id,
        ANALYTICS_EVENTS.ACCOUNT_DELETION_SCHEDULED,
        {
          scheduled_for: scheduled.toISOString(),
          grace_period_days: GRACE_PERIOD_DAYS,
        },
      );
      return {
        ok: true,
        scheduledFor: scheduled,
        gracePeriodDays: GRACE_PERIOD_DAYS,
      };
    }),

  cancelDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    await prisma.profile.update({
      where: { id: ctx.user.id },
      data: {
        deletion_requested_at: null,
        deletion_scheduled_for: null,
      },
    });
    await trackServer(
      ctx.user.id,
      ANALYTICS_EVENTS.ACCOUNT_DELETION_CANCELLED,
    );
    return { ok: true };
  }),

  // Records that the avatar was changed. The actual upload happens via the
  // /api/upload/avatar route (which has direct file-stream access). This
  // mutation persists the resulting URL on the profile and invalidates
  // caches.
  setAvatarUrl: protectedProcedure
    .input(
      z.object({
        avatar_url: z.string().url().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await prisma.profile.update({
        where: { id: ctx.user.id },
        data: { avatar_url: input.avatar_url },
        select: { id: true },
      });
      return { ok: true };
    }),
});

/**
 * Hard-delete a user past the grace period. Cascades through Postgres
 * because every domain table has `on delete cascade` on its profile FK.
 * Called by the daily cron and from the admin settings UI for manual
 * runs.
 */
export async function hardDeleteUser(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  // Delete the auth.users row first; the public.profiles cascade picks
  // up everything else through Prisma onDelete cascades. If the auth
  // user is already gone, treat as already-deleted (idempotent).
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error && !/not.?found/i.test(error.message)) {
    reportError("account.hardDelete.failed", error, { userId });
    throw error;
  }
}
