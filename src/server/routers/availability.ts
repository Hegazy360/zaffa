import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

async function requirePlanner(userId: string) {
  const planner = await prisma.plannerProfile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!planner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Schedule is for planners only",
    });
  }
  return planner;
}

function monthRange(year: number, month: number) {
  // month is 1-12. Use UTC to avoid TZ drift between client/server.
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return { start, end };
}

export const availabilityRouter = router({
  forMonth: protectedProcedure
    .input(
      z.object({
        year: z.number().int().min(1970).max(3000),
        month: z.number().int().min(1).max(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const { start, end } = monthRange(input.year, input.month);

      const [bookedEvents, blocks] = await Promise.all([
        // Events the planner is engaged on with a date that falls in the month.
        prisma.event.findMany({
          where: {
            planner_id: planner.id,
            event_date: { gte: start, lte: end },
          },
          orderBy: { event_date: "asc" },
          select: {
            id: true,
            title: true,
            event_date: true,
            venue: true,
            designs: {
              where: { approved_at: { not: null } },
              orderBy: { approved_at: "desc" },
              take: 1,
              select: { palette: true },
            },
          },
        }),
        // Blocks that overlap with the month at all (start in or end in or
        // span across).
        prisma.plannerBlock.findMany({
          where: {
            planner_id: planner.id,
            start_date: { lte: end },
            end_date: { gte: start },
          },
          orderBy: { start_date: "asc" },
        }),
      ]);

      return {
        bookedEvents: bookedEvents.map((e) => ({
          id: e.id,
          title: e.title,
          event_date: e.event_date,
          venue: e.venue,
          palette: e.designs[0]?.palette ?? null,
        })),
        blocks,
      };
    }),

  // Returns conflicts for a single date (used by the marketplace "apply"
  // banner). Conflicts include: an existing block that covers the date, OR
  // an already-booked event on that date.
  conflictsForDate: protectedProcedure
    .input(z.object({ date: z.coerce.date() }))
    .query(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      // Normalize to start-of-day UTC so the @db.Date columns compare cleanly.
      const day = new Date(
        Date.UTC(
          input.date.getUTCFullYear(),
          input.date.getUTCMonth(),
          input.date.getUTCDate()
        )
      );

      const [block, event] = await Promise.all([
        prisma.plannerBlock.findFirst({
          where: {
            planner_id: planner.id,
            start_date: { lte: day },
            end_date: { gte: day },
          },
          select: { id: true, start_date: true, end_date: true, reason: true },
        }),
        prisma.event.findFirst({
          where: { planner_id: planner.id, event_date: day },
          select: { id: true, title: true },
        }),
      ]);

      const conflicts: Array<
        | {
            kind: "block";
            id: string;
            start_date: Date;
            end_date: Date;
            reason: string | null;
          }
        | { kind: "event"; id: string; title: string }
      > = [];
      if (block) {
        conflicts.push({ kind: "block", ...block });
      }
      if (event) {
        conflicts.push({ kind: "event", id: event.id, title: event.title });
      }
      return conflicts;
    }),

  createBlock: protectedProcedure
    .input(
      z.object({
        start_date: z.coerce.date(),
        end_date: z.coerce.date(),
        reason: z.string().max(280).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      if (input.end_date < input.start_date) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End date must be on or after start date",
        });
      }
      return prisma.plannerBlock.create({
        data: {
          planner_id: planner.id,
          start_date: input.start_date,
          end_date: input.end_date,
          reason: input.reason ?? null,
        },
      });
    }),

  updateBlock: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        start_date: z.coerce.date().optional(),
        end_date: z.coerce.date().optional(),
        reason: z.string().max(280).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const block = await prisma.plannerBlock.findFirst({
        where: { id: input.id, planner_id: planner.id },
        select: { id: true },
      });
      if (!block) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }
      const { id, ...rest } = input;
      return prisma.plannerBlock.update({
        where: { id },
        data: {
          ...(rest.start_date !== undefined ? { start_date: rest.start_date } : {}),
          ...(rest.end_date !== undefined ? { end_date: rest.end_date } : {}),
          ...(rest.reason !== undefined ? { reason: rest.reason } : {}),
        },
      });
    }),

  deleteBlock: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const block = await prisma.plannerBlock.findFirst({
        where: { id: input.id, planner_id: planner.id },
        select: { id: true },
      });
      if (!block) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }
      return prisma.plannerBlock.delete({ where: { id: input.id } });
    }),
});
