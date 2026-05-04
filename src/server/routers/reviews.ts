import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

// Recomputes the rolling avg_rating + review_count cached on PlannerProfile.
// Called from inside transactions so the planner card stays in sync without a
// background worker. We round avg to 2 decimals to match the @db.Decimal(3,2)
// column.
async function recomputePlannerAggregates(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  plannerId: string
) {
  const agg = await tx.review.aggregate({
    where: { planner_id: plannerId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.plannerProfile.update({
    where: { id: plannerId },
    data: {
      avg_rating: agg._avg.rating ?? 0,
      review_count: agg._count._all,
    },
  });
}

// Confirms the caller has standing to review the given planner on the given
// event: they must own the event, and must have engaged that planner at least
// once (currently accepted, or previously released — both count as "worked
// with them"). This stops random users from leaving reviews.
async function requireEngagement(
  eventId: string,
  plannerId: string,
  userId: string
) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, client_id: userId },
    select: { id: true },
  });
  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
  }
  const proposal = await prisma.proposal.findFirst({
    where: {
      event_id: eventId,
      planner_id: plannerId,
      status: { in: ["accepted", "released"] },
    },
    select: { id: true },
  });
  if (!proposal) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only review planners you've engaged on this event",
    });
  }
}

export const reviewsRouter = router({
  // Public list of reviews for a planner. Used on the public profile page so
  // signed-out visitors can browse social proof.
  forPlanner: publicProcedure
    .input(z.object({ plannerId: z.string().uuid() }))
    .query(async ({ input }) => {
      return prisma.review.findMany({
        where: { planner_id: input.plannerId },
        orderBy: { created_at: "desc" },
        include: {
          author: { select: { full_name: true, avatar_url: true } },
          event: { select: { id: true, event_type: true, event_date: true } },
        },
      });
    }),

  // Returns the caller's existing review for (event, planner) or null. Powers
  // the "Leave a review" vs "Edit your review" CTA on the proposals tab.
  mineForEvent: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        plannerId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      return prisma.review.findUnique({
        where: {
          author_id_planner_id_event_id: {
            author_id: ctx.user.id,
            planner_id: input.plannerId,
            event_id: input.eventId,
          },
        },
      });
    }),

  // Idempotent create-or-update. The unique key (author, planner, event) means
  // a couple can revise their review (e.g. raise the rating after a great
  // event) without duplicating rows.
  upsert: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        plannerId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z
          .string()
          .trim()
          .max(2000)
          .optional()
          .transform((v) => (v && v.length > 0 ? v : null)),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireEngagement(input.eventId, input.plannerId, ctx.user.id);
      const result = await prisma.$transaction(async (tx) => {
        const review = await tx.review.upsert({
          where: {
            author_id_planner_id_event_id: {
              author_id: ctx.user.id,
              planner_id: input.plannerId,
              event_id: input.eventId,
            },
          },
          create: {
            author_id: ctx.user.id,
            planner_id: input.plannerId,
            event_id: input.eventId,
            rating: input.rating,
            comment: input.comment,
          },
          update: {
            rating: input.rating,
            comment: input.comment,
          },
        });
        await recomputePlannerAggregates(tx, input.plannerId);
        return review;
      });
      // Couple-journey funnel — fired on every upsert (create or rating
      // edit) since both are meaningful engagement signals.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.REVIEW_POSTED, {
        target: "planner",
        review_id: result.id,
        planner_id: input.plannerId,
        event_id: input.eventId,
        rating: input.rating,
      });
      return result;
    }),

  // Authors can delete their own reviews. Recomputes aggregates so the
  // planner's card doesn't stay inflated by a removed rating.
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const review = await prisma.review.findUnique({
        where: { id: input.id },
        select: { id: true, author_id: true, planner_id: true },
      });
      if (!review) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });
      }
      if (review.author_id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own reviews",
        });
      }
      return prisma.$transaction(async (tx) => {
        await tx.review.delete({ where: { id: review.id } });
        await recomputePlannerAggregates(tx, review.planner_id);
        return { ok: true };
      });
    }),
});
