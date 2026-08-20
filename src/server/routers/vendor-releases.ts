import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

async function requirePlanner(userId: string) {
  const planner = await prisma.plannerProfile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!planner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Planner profile required",
    });
  }
  return planner;
}

async function requireVendor(userId: string) {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!vendor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vendor profile required",
    });
  }
  return vendor;
}

// Returns the planner's available-now figure using the same accounting as
// the payouts router. Defined inline so this router doesn't depend on
// payouts.ts (and the inverse). Both call the same primitive aggregates so
// numbers stay aligned.
async function computeAvailableNow(plannerId: string): Promise<number> {
  const [accruedAgg, selfPayoutAgg, vendorPaidAgg, vendorPendingAgg] =
    await Promise.all([
      prisma.payment.aggregate({
        where: {
          status: { in: ["paid", "refunded"] },
          schedule: { planner_id: plannerId },
        },
        _sum: { net_to_planner_amount: true },
      }),
      prisma.payout.aggregate({
        where: { planner_id: plannerId, recipient_type: "planner" },
        _sum: { amount: true },
      }),
      prisma.vendorRelease.aggregate({
        where: { planner_id: plannerId, status: "paid" },
        _sum: { amount: true },
      }),
      prisma.vendorRelease.aggregate({
        where: { planner_id: plannerId, status: "pending" },
        _sum: { amount: true },
      }),
    ]);
  const accrued = Number(accruedAgg._sum.net_to_planner_amount ?? 0);
  const out =
    Number(selfPayoutAgg._sum.amount ?? 0) +
    Number(vendorPaidAgg._sum.amount ?? 0) +
    Number(vendorPendingAgg._sum.amount ?? 0);
  return Math.max(0, accrued - out);
}

export const vendorReleasesRouter = router({
  // Planner creates a new release against an active engagement. The amount
  // is checked against `available_now` so a planner can't earmark money
  // they've already promised somewhere else. Currency must match the
  // engagement's currency since vendor payouts inherit the same code.
  create: protectedProcedure
    .input(
      z.object({
        engagement_id: z.string().uuid(),
        label: z.string().min(1).max(120),
        amount: z.number().min(0.01).max(10_000_000),
        notes: z.string().max(2000).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const engagement = await prisma.vendorEngagement.findUnique({
        where: { id: input.engagement_id },
        select: {
          id: true,
          planner_id: true,
          vendor_id: true,
          status: true,
          currency: true,
        },
      });
      if (!engagement || engagement.planner_id !== planner.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Engagement not found",
        });
      }
      if (!["accepted", "active", "completed"].includes(engagement.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Engagement must be accepted before releasing funds",
        });
      }
      const available = await computeAvailableNow(planner.id);
      if (input.amount > available + 0.0001) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Available balance ${available.toFixed(2)} ${engagement.currency} is less than ${input.amount.toFixed(2)}`,
        });
      }
      const release = await prisma.vendorRelease.create({
        data: {
          engagement_id: engagement.id,
          planner_id: planner.id,
          vendor_id: engagement.vendor_id,
          label: input.label,
          amount: input.amount,
          currency: engagement.currency,
          status: "pending",
          notes: input.notes ?? null,
        },
      });
      // Planner-journey funnel, every release queued is a step toward
      // the vendor getting paid. Useful for spotting planners who book
      // vendors but never release funds.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.RELEASE_QUEUED, {
        release_id: release.id,
        engagement_id: engagement.id,
        vendor_id: engagement.vendor_id,
        amount: input.amount,
        currency: engagement.currency,
      });
      return release;
    }),

  // Planner cancels a pending release before admin pays it out. Already-paid
  // releases are immutable here (refunds are an admin action).
  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const release = await prisma.vendorRelease.findUnique({
        where: { id: input.id },
        select: { id: true, planner_id: true, status: true },
      });
      if (!release || release.planner_id !== planner.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Release not found",
        });
      }
      if (release.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending releases can be cancelled",
        });
      }
      return prisma.vendorRelease.update({
        where: { id: release.id },
        data: { status: "cancelled" },
      });
    }),

  // Vendor view of their incoming releases (pending + paid). Drives the
  // vendor earnings page. Empty pre-onboarding so the page can render
  // without a profile row.
  forVendor: protectedProcedure.query(async ({ ctx }) => {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { user_id: ctx.user.id },
      select: { id: true },
    });
    if (!vendor) return [];
    return prisma.vendorRelease.findMany({
      where: { vendor_id: vendor.id },
      orderBy: { requested_at: "desc" },
      include: {
        engagement: {
          select: {
            id: true,
            title: true,
            event: { select: { id: true, title: true } },
          },
        },
        planner: {
          select: {
            id: true,
            business_name: true,
            profile: { select: { full_name: true, avatar_url: true } },
          },
        },
      },
    });
  }),

  // Planner view of their outgoing releases. Used on the engagement detail
  // panels and the planner earnings breakdown.
  forPlanner: protectedProcedure.query(async ({ ctx }) => {
    const planner = await prisma.plannerProfile.findUnique({
      where: { user_id: ctx.user.id },
      select: { id: true },
    });
    if (!planner) return [];
    return prisma.vendorRelease.findMany({
      where: { planner_id: planner.id },
      orderBy: { requested_at: "desc" },
      include: {
        engagement: {
          select: {
            id: true,
            title: true,
            event: { select: { id: true, title: true } },
          },
        },
        vendor: {
          select: {
            id: true,
            business_name: true,
            profile: { select: { full_name: true, avatar_url: true } },
          },
        },
      },
    });
  }),

  // Vendor balance: pending releases (not yet paid by admin) + paid (lifetime
  // collected). We mirror the planner balance shape so the same UI patterns
  // work on both sides.
  vendorBalance: protectedProcedure.query(async ({ ctx }) => {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { user_id: ctx.user.id },
      select: { id: true },
    });
    if (!vendor) {
      return {
        pendingAmount: 0,
        pendingCount: 0,
        lifetimeReleased: 0,
        lifetimeReleasedCount: 0,
        lifetimePaidOut: 0,
      };
    }
    const [pendingAgg, paidAgg, payoutAgg] = await Promise.all([
      prisma.vendorRelease.aggregate({
        where: { vendor_id: vendor.id, status: "pending" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.vendorRelease.aggregate({
        where: { vendor_id: vendor.id, status: "paid" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payout.aggregate({
        where: { vendor_id: vendor.id, recipient_type: "vendor" },
        _sum: { amount: true },
      }),
    ]);
    return {
      pendingAmount: Number(pendingAgg._sum.amount ?? 0),
      pendingCount: pendingAgg._count._all,
      lifetimeReleased: Number(paidAgg._sum.amount ?? 0),
      lifetimeReleasedCount: paidAgg._count._all,
      lifetimePaidOut: Number(payoutAgg._sum.amount ?? 0),
    };
  }),
});
