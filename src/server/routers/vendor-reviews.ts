import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { notifyReviewReceivedVendor } from "@/server/services/notifications/dispatchers";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

// Recomputes the rolling avg_rating + review_count cached on VendorProfile.
// Mirrors recomputePlannerAggregates in reviews.ts so vendor cards stay in
// sync without a background worker.
async function recomputeVendorAggregates(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  vendorId: string,
) {
  const agg = await tx.vendorReview.aggregate({
    where: { vendor_id: vendorId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.vendorProfile.update({
    where: { id: vendorId },
    data: {
      avg_rating: agg._avg.rating ?? 0,
      review_count: agg._count._all,
    },
  });
}

// Confirms the caller is the engaging planner on the engagement and that
// the engagement is completed. Reviews are gated on completion so vendors
// can't be reviewed mid-flight.
async function requireEngagementForReview(
  engagementId: string,
  vendorId: string,
  userId: string,
) {
  const planner = await prisma.plannerProfile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!planner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only planners can review vendors",
    });
  }
  const engagement = await prisma.vendorEngagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      planner_id: true,
      vendor_id: true,
      status: true,
    },
  });
  if (!engagement) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Engagement not found",
    });
  }
  if (engagement.planner_id !== planner.id || engagement.vendor_id !== vendorId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  if (engagement.status !== "completed") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "You can only review completed engagements",
    });
  }
}

export const vendorReviewsRouter = router({
  // Reviews on the public-ish vendor profile (planner-side only — clients
  // don't see vendors). publicProcedure so it works in SSR contexts; access
  // gating happens in the consuming pages.
  forVendor: publicProcedure
    .input(z.object({ vendorId: z.string().uuid() }))
    .query(async ({ input }) => {
      return prisma.vendorReview.findMany({
        where: { vendor_id: input.vendorId },
        orderBy: { created_at: "desc" },
        include: {
          author: { select: { full_name: true, avatar_url: true } },
          engagement: {
            select: {
              id: true,
              title: true,
              event: { select: { id: true, title: true, event_type: true } },
            },
          },
        },
      });
    }),

  // Returns the caller's existing review for (vendor, engagement) or null —
  // powers the "Leave a review" / "Edit your review" CTA on the engagement
  // detail page.
  mineForEngagement: protectedProcedure
    .input(
      z.object({
        engagementId: z.string().uuid(),
        vendorId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return prisma.vendorReview.findUnique({
        where: {
          author_id_vendor_id_engagement_id: {
            author_id: ctx.user.id,
            vendor_id: input.vendorId,
            engagement_id: input.engagementId,
          },
        },
      });
    }),

  // Idempotent create-or-update. Same shape as reviews.upsert but keyed on
  // (author, vendor, engagement) so a planner who hires the same vendor
  // twice gets two reviews — one per event.
  upsert: protectedProcedure
    .input(
      z.object({
        engagementId: z.string().uuid(),
        vendorId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z
          .string()
          .trim()
          .max(2000)
          .optional()
          .transform((v) => (v && v.length > 0 ? v : null)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireEngagementForReview(
        input.engagementId,
        input.vendorId,
        ctx.user.id,
      );
      const { review, wasCreated } = await prisma.$transaction(async (tx) => {
        const existing = await tx.vendorReview.findUnique({
          where: {
            author_id_vendor_id_engagement_id: {
              author_id: ctx.user.id,
              vendor_id: input.vendorId,
              engagement_id: input.engagementId,
            },
          },
          select: { id: true },
        });
        const r = await tx.vendorReview.upsert({
          where: {
            author_id_vendor_id_engagement_id: {
              author_id: ctx.user.id,
              vendor_id: input.vendorId,
              engagement_id: input.engagementId,
            },
          },
          create: {
            author_id: ctx.user.id,
            vendor_id: input.vendorId,
            engagement_id: input.engagementId,
            rating: input.rating,
            comment: input.comment,
          },
          update: {
            rating: input.rating,
            comment: input.comment,
          },
        });
        await recomputeVendorAggregates(tx, input.vendorId);
        return { review: r, wasCreated: !existing };
      });

      // Only fire the notification on first-time creation — edits to
      // existing reviews shouldn't spam the vendor every time a planner
      // fiddles with the rating.
      if (wasCreated) {
        const ctx2 = await prisma.vendorProfile.findUnique({
          where: { id: input.vendorId },
          select: {
            user_id: true,
            profile: { select: { full_name: true } },
          },
        });
        const author = await prisma.profile.findUnique({
          where: { id: ctx.user.id },
          select: { full_name: true },
        });
        if (ctx2 && author) {
          await notifyReviewReceivedVendor({
            vendorUserId: ctx2.user_id,
            authorName: author.full_name,
            rating: input.rating,
            engagementId: input.engagementId,
          });
        }
      }
      // Couple/planner journey funnel — vendor reviews are authored by
      // planners (not couples), so the distinctId is the planner's
      // user id. Tracked on every upsert (create or edit).
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.REVIEW_POSTED, {
        target: "vendor",
        review_id: review.id,
        vendor_id: input.vendorId,
        engagement_id: input.engagementId,
        rating: input.rating,
      });
      return review;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const review = await prisma.vendorReview.findUnique({
        where: { id: input.id },
        select: { id: true, author_id: true, vendor_id: true },
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
        await tx.vendorReview.delete({ where: { id: review.id } });
        await recomputeVendorAggregates(tx, review.vendor_id);
        return { ok: true };
      });
    }),
});
