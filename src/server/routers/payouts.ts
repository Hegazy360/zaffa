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
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a planner" });
  }
  return planner;
}

export const payoutsRouter = router({
  // Balance breakdown for the calling planner. The four numbers the UI
  // surfaces are:
  //   accrued            = lifetime net earned (paid installments)
  //   paid_out_self      = sum of payouts where the recipient is this planner
  //   paid_out_vendors   = sum of paid VendorReleases this planner funded
  //   committed_to_vendors = pending VendorReleases (earmarked but not paid)
  //   available_now      = accrued - paid_out_self - paid_out_vendors
  //                                - committed_to_vendors
  //
  // We also keep `pendingNet` = paid installments not yet attached to any
  // Payout for backwards-compatible UIs that show a single payable number.
  plannerBalance: protectedProcedure.query(async ({ ctx }) => {
    const planner = await requirePlanner(ctx.user.id);
    const [
      pendingAgg,
      lifetimeCollected,
      paidOutSelfAgg,
      paidOutVendorAgg,
      committedVendorAgg,
      heldAgg,
    ] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          status: "paid",
          payout_id: null,
          disputed_at: null,
          refunded_amount: 0,
          schedule: { planner_id: planner.id },
        },
        _sum: { net_to_planner_amount: true, amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          status: { in: ["paid", "refunded", "partially_refunded"] },
          schedule: { planner_id: planner.id },
        },
        _sum: {
          amount: true,
          net_to_planner_amount: true,
          platform_fee_amount: true,
          refunded_amount: true,
        },
      }),
      prisma.payout.aggregate({
        where: { planner_id: planner.id, recipient_type: "planner" },
        _sum: { amount: true },
      }),
      prisma.vendorRelease.aggregate({
        where: { planner_id: planner.id, status: "paid" },
        _sum: { amount: true },
      }),
      prisma.vendorRelease.aggregate({
        where: { planner_id: planner.id, status: "pending" },
        _sum: { amount: true },
      }),
      // Disputed-but-not-yet-paid-out installments. Held back from the
      // available pool until the dispute resolves so we don't pay out
      // funds we may have to claw back.
      prisma.payment.aggregate({
        where: {
          status: "paid",
          payout_id: null,
          disputed_at: { not: null },
          dispute_resolved_at: null,
          schedule: { planner_id: planner.id },
        },
        _sum: { net_to_planner_amount: true, amount: true },
      }),
    ]);
    const accrued = Number(lifetimeCollected._sum.net_to_planner_amount ?? 0);
    const refundedTotal = Number(lifetimeCollected._sum.refunded_amount ?? 0);
    const paidOutSelf = Number(paidOutSelfAgg._sum.amount ?? 0);
    const paidOutVendors = Number(paidOutVendorAgg._sum.amount ?? 0);
    const committedToVendors = Number(committedVendorAgg._sum.amount ?? 0);
    const heldForDispute = Number(heldAgg._sum.net_to_planner_amount ?? 0);
    const availableNow = Math.max(
      0,
      accrued - paidOutSelf - paidOutVendors - committedToVendors - heldForDispute,
    );
    return {
      pendingNet: Number(pendingAgg._sum.net_to_planner_amount ?? 0),
      pendingGross: Number(pendingAgg._sum.amount ?? 0),
      lifetimeCollected: Number(lifetimeCollected._sum.amount ?? 0),
      lifetimeNet: accrued,
      lifetimeFees: Number(lifetimeCollected._sum.platform_fee_amount ?? 0),
      lifetimePaidOut: paidOutSelf,
      lifetimeRefunded: refundedTotal,
      accrued,
      paidOutSelf,
      paidOutVendors,
      committedToVendors,
      heldForDispute,
      availableNow,
    };
  }),

  // Per-event slice of the planner's wallet. Surfaces what *this* event has
  // earned (paid client installments) and what's already been earmarked or
  // released to vendors *of this event*. Used by the event detail "Available
  // now" banner so planners see numbers tied to the event they're looking
  // at, instead of the global wallet figure.
  //
  // The actual gating on vendorReleases.create is still global (money is
  // fungible across events), so the UI also shows the wallet-wide ceiling.
  eventBalance: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const [accruedAgg, paidVendorAgg, pendingVendorAgg] = await Promise.all([
        prisma.payment.aggregate({
          where: {
            status: { in: ["paid", "refunded"] },
            schedule: { planner_id: planner.id, event_id: input.eventId },
          },
          _sum: { net_to_planner_amount: true, amount: true },
        }),
        prisma.vendorRelease.aggregate({
          where: {
            planner_id: planner.id,
            status: "paid",
            engagement: { event_id: input.eventId },
          },
          _sum: { amount: true },
        }),
        prisma.vendorRelease.aggregate({
          where: {
            planner_id: planner.id,
            status: "pending",
            engagement: { event_id: input.eventId },
          },
          _sum: { amount: true },
        }),
      ]);
      const accrued = Number(accruedAgg._sum.net_to_planner_amount ?? 0);
      const collected = Number(accruedAgg._sum.amount ?? 0);
      const paidToVendors = Number(paidVendorAgg._sum.amount ?? 0);
      const committedToVendors = Number(pendingVendorAgg._sum.amount ?? 0);
      const availableForEvent = Math.max(
        0,
        accrued - paidToVendors - committedToVendors,
      );
      return {
        accrued,
        collected,
        paidToVendors,
        committedToVendors,
        availableForEvent,
      };
    }),

  payoutHistory: protectedProcedure.query(async ({ ctx }) => {
    const planner = await requirePlanner(ctx.user.id);
    return prisma.payout.findMany({
      where: { planner_id: planner.id, recipient_type: "planner" },
      orderBy: { paid_at: "desc" },
      include: {
        installments: {
          select: {
            id: true,
            label: true,
            amount: true,
            net_to_planner_amount: true,
            currency: true,
            event: { select: { id: true, title: true } },
          },
        },
      },
    });
  }),

  // Detailed list of paid-not-yet-paid-out installments. Useful both for
  // the planner's earnings page and for the admin payout form. We surface
  // disputed/refunded rows too — the UI shows them with a "held" badge so
  // the planner understands why they aren't included in `availableNow`.
  pendingInstallments: protectedProcedure.query(async ({ ctx }) => {
    const planner = await requirePlanner(ctx.user.id);
    return prisma.payment.findMany({
      where: {
        status: { in: ["paid", "partially_refunded"] },
        payout_id: null,
        schedule: { planner_id: planner.id },
      },
      orderBy: { paid_at: "desc" },
      select: {
        id: true,
        label: true,
        amount: true,
        net_to_planner_amount: true,
        platform_fee_amount: true,
        currency: true,
        paid_at: true,
        disputed_at: true,
        dispute_status: true,
        refunded_amount: true,
        event: { select: { id: true, title: true } },
      },
    });
  }),

  // Soft "ping" — just sets a flag in admin's view. We don't persist
  // requests separately yet; the admin page surfaces every planner with a
  // positive pending balance regardless. This mutation is idempotent and
  // returns the current balance so the UI can show a confirmation.
  requestPayout: protectedProcedure
    .input(z.object({ note: z.string().max(500).optional() }))
    .mutation(async ({ ctx }) => {
      const planner = await requirePlanner(ctx.user.id);
      const balance = await prisma.payment.aggregate({
        where: {
          status: "paid",
          payout_id: null,
          disputed_at: null,
          refunded_amount: 0,
          schedule: { planner_id: planner.id },
        },
        _sum: { net_to_planner_amount: true },
      });
      const pending = Number(balance._sum.net_to_planner_amount ?? 0);
      if (pending <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No pending balance to request",
        });
      }
      // Planner-journey funnel — fired on each request even though the
      // request itself isn't persisted. The admin queue still shows
      // every planner with a balance, so this captures intent rather
      // than state.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.PAYOUT_REQUESTED, {
        planner_id: planner.id,
        pending_net: pending,
      });
      return { ok: true, pendingNet: pending };
    }),
});
