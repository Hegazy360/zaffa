import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

async function assertAdmin(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
}

export const adminRouter = router({
  // Lists every planner that has a positive pending balance (paid
  // installments not yet linked to a Payout). The admin payouts page uses
  // this as its main feed.
  pendingPayouts: protectedProcedure.query(async ({ ctx }) => {
    await assertAdmin(ctx.user.id);
    const grouped = await prisma.payment.groupBy({
      by: ["currency"],
      where: { status: "paid", payout_id: null },
      _sum: {
        amount: true,
        net_to_planner_amount: true,
        platform_fee_amount: true,
      },
    });
    // Per-planner. groupBy doesn't support relational keys directly, so we
    // pull the underlying rows and bucket in JS — fine at our scale.
    const rows = await prisma.payment.findMany({
      where: { status: "paid", payout_id: null },
      select: {
        amount: true,
        net_to_planner_amount: true,
        platform_fee_amount: true,
        currency: true,
        schedule: {
          select: {
            planner_id: true,
            planner: {
              select: {
                id: true,
                business_name: true,
                profile: { select: { full_name: true, avatar_url: true } },
              },
            },
          },
        },
      },
    });
    const byPlanner = new Map<
      string,
      {
        plannerId: string;
        businessName: string;
        fullName: string;
        avatarUrl: string | null;
        currency: string;
        gross: number;
        net: number;
        fees: number;
        installmentCount: number;
      }
    >();
    for (const r of rows) {
      const planner = r.schedule?.planner;
      if (!planner) continue;
      const key = `${planner.id}:${r.currency}`;
      const existing = byPlanner.get(key);
      const next = existing ?? {
        plannerId: planner.id,
        businessName: planner.business_name,
        fullName: planner.profile.full_name,
        avatarUrl: planner.profile.avatar_url,
        currency: r.currency,
        gross: 0,
        net: 0,
        fees: 0,
        installmentCount: 0,
      };
      next.gross += Number(r.amount);
      next.net += Number(r.net_to_planner_amount ?? 0);
      next.fees += Number(r.platform_fee_amount ?? 0);
      next.installmentCount += 1;
      byPlanner.set(key, next);
    }
    return {
      totals: grouped.map((g) => ({
        currency: g.currency,
        gross: Number(g._sum.amount ?? 0),
        net: Number(g._sum.net_to_planner_amount ?? 0),
        fees: Number(g._sum.platform_fee_amount ?? 0),
      })),
      planners: Array.from(byPlanner.values()).sort((a, b) => b.net - a.net),
    };
  }),

  // Pending installments for one planner so admin can pick which to include.
  plannerPending: protectedProcedure
    .input(z.object({ plannerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.payment.findMany({
        where: {
          status: "paid",
          payout_id: null,
          schedule: { planner_id: input.plannerId },
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

  // Records an off-Stripe payout: creates a Payout row, links chosen
  // installments to it, and locks them.
  recordPayout: protectedProcedure
    .input(
      z.object({
        plannerId: z.string().uuid(),
        installmentIds: z.array(z.string().uuid()).min(1).max(200),
        currency: z.string().min(2).max(8).default("EGP"),
        method: z.enum(["instapay", "wire", "cash", "other"]).default("instapay"),
        reference: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        paid_at: z.coerce.date().default(() => new Date()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      // Validate every installment is a paid, not-yet-paid-out row for
      // this planner in the chosen currency.
      const eligible = await prisma.payment.findMany({
        where: {
          id: { in: input.installmentIds },
          status: "paid",
          payout_id: null,
          currency: input.currency,
          schedule: { planner_id: input.plannerId },
        },
        select: { id: true, net_to_planner_amount: true },
      });
      if (eligible.length !== input.installmentIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Some installments are no longer eligible for payout",
        });
      }
      const totalNet = eligible.reduce(
        (s, p) => s + Number(p.net_to_planner_amount ?? 0),
        0
      );

      return prisma.$transaction(async (tx) => {
        const payout = await tx.payout.create({
          data: {
            planner_id: input.plannerId,
            currency: input.currency,
            amount: totalNet,
            method: input.method,
            reference: input.reference,
            notes: input.notes,
            paid_at: input.paid_at,
            recorded_by_user_id: ctx.user.id,
          },
        });
        await tx.payment.updateMany({
          where: { id: { in: input.installmentIds } },
          data: { payout_id: payout.id },
        });
        return payout;
      });
    }),

  // Recent collected installments + disputes/refunds for an admin overview.
  recentInstallments: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.payment.findMany({
        where: {
          status: { in: ["paid", "refunded"] },
          schedule_id: { not: null },
        },
        orderBy: { paid_at: "desc" },
        take: input?.limit ?? 50,
        select: {
          id: true,
          label: true,
          amount: true,
          currency: true,
          status: true,
          paid_at: true,
          disputed_at: true,
          net_to_planner_amount: true,
          platform_fee_amount: true,
          event: { select: { id: true, title: true } },
          schedule: {
            select: {
              planner: {
                select: { id: true, business_name: true },
              },
            },
          },
        },
      });
    }),

  // Lists every vendor with one or more pending VendorRelease rows. Mirrors
  // pendingPayouts for the planner side so the admin payouts UI can show
  // both queues in the same shape.
  pendingVendorPayouts: protectedProcedure.query(async ({ ctx }) => {
    await assertAdmin(ctx.user.id);
    const releases = await prisma.vendorRelease.findMany({
      where: { status: "pending" },
      orderBy: { requested_at: "desc" },
      include: {
        vendor: {
          select: {
            id: true,
            business_name: true,
            category: true,
            profile: { select: { full_name: true, avatar_url: true } },
          },
        },
        planner: {
          select: { id: true, business_name: true },
        },
        engagement: {
          select: {
            id: true,
            title: true,
            event: { select: { id: true, title: true } },
          },
        },
      },
    });
    type Bucket = {
      vendorId: string;
      businessName: string;
      fullName: string;
      avatarUrl: string | null;
      category: string;
      currency: string;
      total: number;
      releases: typeof releases;
    };
    const byVendor = new Map<string, Bucket>();
    for (const r of releases) {
      if (!r.vendor) continue;
      const key = `${r.vendor.id}:${r.currency}`;
      const existing = byVendor.get(key);
      const next: Bucket = existing ?? {
        vendorId: r.vendor.id,
        businessName: r.vendor.business_name,
        fullName: r.vendor.profile.full_name,
        avatarUrl: r.vendor.profile.avatar_url,
        category: r.vendor.category,
        currency: r.currency,
        total: 0,
        releases: [],
      };
      next.total += Number(r.amount);
      next.releases.push(r);
      byVendor.set(key, next);
    }
    return {
      vendors: Array.from(byVendor.values()).sort((a, b) => b.total - a.total),
    };
  }),

  // Pending releases for one vendor — admin uses this to pick which rows to
  // include in a single payout.
  vendorPending: protectedProcedure
    .input(z.object({ vendorId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.vendorRelease.findMany({
        where: { vendor_id: input.vendorId, status: "pending" },
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
            select: { id: true, business_name: true },
          },
        },
      });
    }),

  // Records an off-Stripe vendor payout: creates a Payout (recipient=vendor),
  // links chosen releases to it, and flips them to paid. Same invariants as
  // recordPayout (amount = sum of selected rows, currency must match).
  recordVendorPayout: protectedProcedure
    .input(
      z.object({
        vendorId: z.string().uuid(),
        releaseIds: z.array(z.string().uuid()).min(1).max(200),
        currency: z.string().min(2).max(8).default("EGP"),
        method: z.enum(["instapay", "wire", "cash", "other"]).default("instapay"),
        reference: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        paid_at: z.coerce.date().default(() => new Date()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const eligible = await prisma.vendorRelease.findMany({
        where: {
          id: { in: input.releaseIds },
          status: "pending",
          currency: input.currency,
          vendor_id: input.vendorId,
        },
        select: { id: true, amount: true },
      });
      if (eligible.length !== input.releaseIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Some releases are no longer eligible for payout",
        });
      }
      const total = eligible.reduce((s, r) => s + Number(r.amount), 0);
      return prisma.$transaction(async (tx) => {
        const payout = await tx.payout.create({
          data: {
            vendor_id: input.vendorId,
            recipient_type: "vendor",
            currency: input.currency,
            amount: total,
            method: input.method,
            reference: input.reference,
            notes: input.notes,
            paid_at: input.paid_at,
            recorded_by_user_id: ctx.user.id,
          },
        });
        await tx.vendorRelease.updateMany({
          where: { id: { in: input.releaseIds } },
          data: { status: "paid", paid_at: input.paid_at, payout_id: payout.id },
        });
        return payout;
      });
    }),
});
