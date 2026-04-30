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
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a planner" });
  }
  return planner;
}

export const payoutsRouter = router({
  // Pending balance + lifetime totals for the calling planner. Pending =
  // sum of net_to_planner_amount on paid installments that haven't been
  // attached to a Payout yet. Refunded installments are excluded.
  plannerBalance: protectedProcedure.query(async ({ ctx }) => {
    const planner = await requirePlanner(ctx.user.id);
    const [pendingAgg, lifetimeCollected, paidOutAgg] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          status: "paid",
          payout_id: null,
          schedule: { planner_id: planner.id },
        },
        _sum: { net_to_planner_amount: true, amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          status: { in: ["paid", "refunded"] },
          schedule: { planner_id: planner.id },
        },
        _sum: { amount: true, net_to_planner_amount: true, platform_fee_amount: true },
      }),
      prisma.payout.aggregate({
        where: { planner_id: planner.id },
        _sum: { amount: true },
      }),
    ]);
    return {
      pendingNet: Number(pendingAgg._sum.net_to_planner_amount ?? 0),
      pendingGross: Number(pendingAgg._sum.amount ?? 0),
      lifetimeCollected: Number(lifetimeCollected._sum.amount ?? 0),
      lifetimeNet: Number(lifetimeCollected._sum.net_to_planner_amount ?? 0),
      lifetimeFees: Number(lifetimeCollected._sum.platform_fee_amount ?? 0),
      lifetimePaidOut: Number(paidOutAgg._sum.amount ?? 0),
    };
  }),

  payoutHistory: protectedProcedure.query(async ({ ctx }) => {
    const planner = await requirePlanner(ctx.user.id);
    return prisma.payout.findMany({
      where: { planner_id: planner.id },
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
  // the planner's earnings page and for the admin payout form.
  pendingInstallments: protectedProcedure.query(async ({ ctx }) => {
    const planner = await requirePlanner(ctx.user.id);
    return prisma.payment.findMany({
      where: {
        status: "paid",
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
      // Future: send email / Slack to admin. For now, return ack.
      return { ok: true, pendingNet: pending };
    }),
});
