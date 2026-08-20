import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

const listInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
  unreadOnly: z.boolean().default(false),
});

export const notificationsRouter = router({
  // Paginated feed for the /dashboard/notifications page. Cursor-based so
  // infinite-scroll can load older rows without shifting as new ones
  // arrive at the top.
  list: protectedProcedure
    .input(listInputSchema)
    .query(async ({ ctx, input }) => {
      const rows = await prisma.notification.findMany({
        where: {
          user_id: ctx.user.id,
          ...(input.unreadOnly ? { read_at: null } : {}),
        },
        orderBy: { created_at: "desc" },
        take: input.limit + 1,
        ...(input.cursor
          ? {
              cursor: { id: input.cursor },
              skip: 1,
            }
          : {}),
      });
      let nextCursor: string | undefined;
      if (rows.length > input.limit) {
        nextCursor = rows.pop()!.id;
      }
      return { items: rows, nextCursor };
    }),

  // Lean list used by the bell dropdown. Always includes everything (read
  // + unread) so the user has a consistent recency view at a glance.
  recent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      return prisma.notification.findMany({
        where: { user_id: ctx.user.id },
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 10,
      });
    }),

  // Just the count, cheap query the bell badge re-fetches every ~30s (and
  // on realtime postgres_changes events).
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await prisma.notification.count({
      where: { user_id: ctx.user.id, read_at: null },
    });
    return { count };
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // updateMany so ownership mismatch simply no-ops instead of throwing
      // a 404 (UI shouldn't have to care about the race where the row
      // vanished between render + click).
      await prisma.notification.updateMany({
        where: { id: input.id, user_id: ctx.user.id, read_at: null },
        data: { read_at: new Date() },
      });
      return { ok: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: { user_id: ctx.user.id, read_at: null },
      data: { read_at: now },
    });
    return { ok: true, updated: result.count };
  }),

  // Minimal email preference. v1 is all-or-nothing; we can layer
  // per-category toggles on top without breaking callers.
  emailPreference: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.profile.findUnique({
      where: { id: ctx.user.id },
      select: { email_unsubscribed_at: true },
    });
    return {
      unsubscribedFromAll: Boolean(profile?.email_unsubscribed_at),
      unsubscribedAt: profile?.email_unsubscribed_at ?? null,
    };
  }),

  updateEmailPreference: protectedProcedure
    .input(z.object({ unsubscribedFromAll: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await prisma.profile.findUnique({
        where: { id: ctx.user.id },
        select: { id: true },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await prisma.profile.update({
        where: { id: ctx.user.id },
        data: {
          email_unsubscribed_at: input.unsubscribedFromAll ? new Date() : null,
        },
      });
      return { ok: true };
    }),
});
