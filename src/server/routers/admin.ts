import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { fromStripeAmount, toStripeAmount } from "@/lib/payments";
import { formatMoney } from "./payment-schedules";
import {
  notifyPaymentRefunded,
  notifyPayoutReceived,
} from "@/server/services/notifications/dispatchers";
import { reportError } from "@/lib/logger";
import { PACK_SKUS, type PackSkuId } from "@/lib/vision-pack";

const packSkuSchema = z.enum(
  Object.keys(PACK_SKUS) as [PackSkuId, ...PackSkuId[]],
);

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
  // Toggle the `verified` badge on a planner or vendor profile. Used by
  // the admin > users detail page. The badge powers the "Verified" UI on
  // proposal cards, planner directory, and vendor profiles.
  setVerified: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        kind: z.enum(["planner", "vendor"]),
        verified: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      if (input.kind === "planner") {
        const updated = await prisma.plannerProfile.updateMany({
          where: { user_id: input.userId },
          data: { verified: input.verified },
        });
        if (updated.count === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No planner profile for this user",
          });
        }
      } else {
        const updated = await prisma.vendorProfile.updateMany({
          where: { user_id: input.userId },
          data: { verified: input.verified },
        });
        if (updated.count === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No vendor profile for this user",
          });
        }
      }
      return { ok: true };
    }),


  // Lists every planner that has a positive pending balance (paid
  // installments not yet linked to a Payout). Disputed/refunded rows are
  // held back from the queue until they resolve so we don't pay a planner
  // out of money we may have to claw back. The admin payouts page uses
  // this as its main feed.
  pendingPayouts: protectedProcedure.query(async ({ ctx }) => {
    await assertAdmin(ctx.user.id);
    const baseWhere = {
      status: "paid" as const,
      payout_id: null,
      disputed_at: null,
      refunded_amount: 0,
    };
    const grouped = await prisma.payment.groupBy({
      by: ["currency"],
      where: baseWhere,
      _sum: {
        amount: true,
        net_to_planner_amount: true,
        platform_fee_amount: true,
      },
    });
    // Per-planner. groupBy doesn't support relational keys directly, so we
    // pull the underlying rows and bucket in JS, fine at our scale.
    const rows = await prisma.payment.findMany({
      where: baseWhere,
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
          disputed_at: null,
          refunded_amount: 0,
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

      const payout = await prisma.$transaction(async (tx) => {
        const p = await tx.payout.create({
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
          data: { payout_id: p.id },
        });
        return p;
      });

      // Loop the planner in so they see the money landing in their wallet
      // without having to refresh. The payout record is the source of truth,
      // so we derive the recipient from it rather than trusting input.
      const planner = await prisma.plannerProfile.findUnique({
        where: { id: input.plannerId },
        select: { user_id: true },
      });
      if (planner) {
        await notifyPayoutReceived({
          recipientUserId: planner.user_id,
          role: "planner",
          amount: formatMoney(Number(payout.amount), payout.currency),
          method: payout.method,
          reference: payout.reference,
          payoutId: payout.id,
        });
      }
      return payout;
    }),

  // List active disputes (open or unresolved) so admin can act before the
  // Stripe deadline. Closed disputes also returned for context, ordered by
  // most recently disputed first.
  disputes: protectedProcedure
    .input(
      z
        .object({ includeResolved: z.boolean().default(false) })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.payment.findMany({
        where: {
          disputed_at: { not: null },
          ...(input?.includeResolved
            ? {}
            : { dispute_resolved_at: null }),
        },
        orderBy: { disputed_at: "desc" },
        take: 100,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          disputed_at: true,
          dispute_status: true,
          dispute_resolved_at: true,
          stripe_charge_id: true,
          event: { select: { id: true, title: true, client_id: true } },
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

  // Issue a Stripe refund for a paid installment. Supports partial refunds
  // by passing `amount`. Creates the matching `PaymentRefund` row eagerly
  // so the UI updates immediately; the `charge.refunded` webhook is a
  // back-stop that reconciles the ledger if Stripe sees the refund first.
  refundPayment: protectedProcedure
    .input(
      z.object({
        paymentId: z.string().uuid(),
        // Omit for a full refund of the remaining balance.
        amount: z.number().positive().max(1_000_000).optional(),
        reason: z
          .enum(["duplicate", "fraudulent", "requested_by_customer"])
          .optional(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          refunded_amount: true,
          stripe_charge_id: true,
          stripe_payment_intent_id: true,
          payout_id: true,
          event: { select: { id: true, title: true, client_id: true } },
        },
      });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND" });
      if (!payment.stripe_charge_id && !payment.stripe_payment_intent_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No Stripe charge attached to this payment",
        });
      }
      if (payment.status === "refunded") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Already fully refunded",
        });
      }
      const gross = Number(payment.amount);
      const alreadyRefunded = Number(payment.refunded_amount);
      const remaining = Math.max(0, gross - alreadyRefunded);
      const requested = input.amount ?? remaining;
      if (requested <= 0 || requested - 0.005 > remaining) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Requested ${requested} exceeds refundable ${remaining}`,
        });
      }

      const stripe = getStripe();
      const refund = await stripe.refunds.create({
        charge: payment.stripe_charge_id ?? undefined,
        payment_intent: payment.stripe_charge_id
          ? undefined
          : payment.stripe_payment_intent_id ?? undefined,
        amount: toStripeAmount(requested, payment.currency),
        reason: input.reason,
        metadata: {
          paymentId: payment.id,
          eventId: payment.event.id,
          initiatedBy: ctx.user.id,
        },
      });

      const refundedAmount = fromStripeAmount(refund.amount, payment.currency);

      await prisma.$transaction(async (tx) => {
        await tx.paymentRefund.upsert({
          where: { stripe_refund_id: refund.id },
          create: {
            payment_id: payment.id,
            stripe_refund_id: refund.id,
            amount: refundedAmount,
            currency: payment.currency,
            reason: input.notes ?? input.reason ?? null,
            created_by_user_id: ctx.user.id,
          },
          update: {},
        });
        const cumulative = alreadyRefunded + refundedAmount;
        const fullyRefunded = cumulative >= gross - 0.005;
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refunded_amount: cumulative,
            status: fullyRefunded ? "refunded" : "partially_refunded",
            stripe_refund_id: refund.id,
          },
        });
      });

      await notifyPaymentRefunded({
        clientUserId: payment.event.client_id,
        eventId: payment.event.id,
        eventTitle: payment.event.title,
        amount: formatMoney(refundedAmount, payment.currency),
        paymentId: payment.id,
      });

      return { refundId: refund.id, refundedAmount };
    }),

  // Recent collected installments + disputes/refunds for an admin overview.
  recentInstallments: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.payment.findMany({
        where: {
          status: { in: ["paid", "refunded", "partially_refunded"] },
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
          dispute_status: true,
          refunded_amount: true,
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

  // Pending releases for one vendor, admin uses this to pick which rows to
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
      const payout = await prisma.$transaction(async (tx) => {
        const p = await tx.payout.create({
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
          data: { status: "paid", paid_at: input.paid_at, payout_id: p.id },
        });
        return p;
      });

      const vendor = await prisma.vendorProfile.findUnique({
        where: { id: input.vendorId },
        select: { user_id: true },
      });
      if (vendor) {
        await notifyPayoutReceived({
          recipientUserId: vendor.user_id,
          role: "vendor",
          amount: formatMoney(Number(payout.amount), payout.currency),
          method: payout.method,
          reference: payout.reference,
          payoutId: payout.id,
        });
      }
      return payout;
    }),

  // ----- Vision Pack admin -----

  /** Paginated list of all VisionPack rows for ops. */
  listVisionPacks: protectedProcedure
    .input(
      z.object({
        status: z
          .enum([
            "pending_payment",
            "active",
            "fulfilled",
            "refunded",
            "expired",
          ])
          .optional(),
        query: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().datetime().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const limit = input.limit;
      const cursorDate = input.cursor ? new Date(input.cursor) : null;
      const items = await prisma.visionPack.findMany({
        where: {
          ...(input.status ? { status: input.status } : {}),
          ...(cursorDate ? { created_at: { lt: cursorDate } } : {}),
          ...(input.query
            ? {
                OR: [
                  {
                    microsite_slug: {
                      contains: input.query,
                      mode: "insensitive",
                    },
                  },
                  {
                    recipient: {
                      full_name: {
                        contains: input.query,
                        mode: "insensitive",
                      },
                    },
                  },
                  {
                    buyer: {
                      full_name: {
                        contains: input.query,
                        mode: "insensitive",
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: { created_at: "desc" },
        take: limit + 1,
        select: {
          id: true,
          status: true,
          created_at: true,
          paid_at: true,
          expires_at: true,
          amount: true,
          currency: true,
          renders_quota: true,
          renders_used: true,
          videos_quota: true,
          videos_used: true,
          microsite_slug: true,
          microsite_published_at: true,
          lookbook_downloaded_at: true,
          refunded_at: true,
          stripe_payment_intent_id: true,
          buyer: {
            select: { id: true, full_name: true, avatar_url: true },
          },
          recipient: {
            select: { id: true, full_name: true, avatar_url: true },
          },
          event: {
            select: { id: true, title: true },
          },
        },
      });
      const nextCursor =
        items.length > limit
          ? items[limit]!.created_at.toISOString()
          : null;
      return { items: items.slice(0, limit), nextCursor };
    }),

  /**
   * Issue a full Stripe refund on a Vision Pack purchase and flip the
   * row to `refunded`. No partial refunds, the pack is a packaged
   * SKU, not an installment ledger. Does not gate on the
   * `isPackRefundable` heuristic (admin can override the tripwire).
   */
  refundVisionPack: protectedProcedure
    .input(
      z.object({
        packId: z.string().uuid(),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const pack = await prisma.visionPack.findUnique({
        where: { id: input.packId },
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          stripe_payment_intent_id: true,
          recipient_user_id: true,
        },
      });
      if (!pack) throw new TRPCError({ code: "NOT_FOUND" });
      if (!pack.stripe_payment_intent_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pack has no Stripe payment intent - nothing to refund.",
        });
      }
      if (pack.status === "refunded") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Pack is already refunded.",
        });
      }

      const stripe = getStripe();
      const refund = await stripe.refunds.create({
        payment_intent: pack.stripe_payment_intent_id,
        reason: "requested_by_customer",
        metadata: {
          kind: "vision_pack",
          packId: pack.id,
          initiatedBy: ctx.user.id,
        },
      });

      await prisma.visionPack
        .update({
          where: { id: pack.id },
          data: {
            status: "refunded",
            refunded_at: new Date(),
            refund_reason: input.reason ?? null,
          },
        })
        .catch((err: unknown) =>
          reportError("admin.visionPack.refund.update_failed", err, {
            packId: pack.id,
          }),
        );

      return { refundId: refund.id, amount: Number(pack.amount) };
    }),

  /**
   * Manual quota top-up for a Vision Pack. Used when ops decides to
   * compensate a customer (e.g. a string of failed renders). Adds the
   * requested counts to the existing quota and re-activates a fulfilled
   * pack so the user can keep generating.
   */
  topUpVisionPackQuota: protectedProcedure
    .input(
      z.object({
        packId: z.string().uuid(),
        addRenders: z.number().int().min(0).max(100).default(0),
        addVideos: z.number().int().min(0).max(20).default(0),
        extendDays: z.number().int().min(0).max(180).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      if (
        input.addRenders === 0 &&
        input.addVideos === 0 &&
        input.extendDays === 0
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nothing to top up - set at least one positive amount.",
        });
      }
      const pack = await prisma.visionPack.findUnique({
        where: { id: input.packId },
        select: {
          id: true,
          status: true,
          renders_quota: true,
          videos_quota: true,
          expires_at: true,
        },
      });
      if (!pack) throw new TRPCError({ code: "NOT_FOUND" });
      if (pack.status === "refunded") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cannot top up a refunded pack.",
        });
      }
      const newExpires =
        input.extendDays > 0 && pack.expires_at
          ? new Date(
              pack.expires_at.getTime() + input.extendDays * 24 * 60 * 60 * 1000,
            )
          : pack.expires_at;
      const updated = await prisma.visionPack.update({
        where: { id: pack.id },
        data: {
          renders_quota: pack.renders_quota + input.addRenders,
          videos_quota: pack.videos_quota + input.addVideos,
          expires_at: newExpires,
          // Re-arm a fulfilled pack so the user can generate again on
          // the bumped quota.
          ...(pack.status === "fulfilled" || pack.status === "expired"
            ? { status: "active" as const }
            : {}),
        },
      });
      return {
        renders_quota: updated.renders_quota,
        videos_quota: updated.videos_quota,
        expires_at: updated.expires_at,
        status: updated.status,
      };
    }),

  /**
   * Vision Pack pricing, admin CRUD for the per-country override
   * table. The seed table in `src/lib/vision-pack-pricing.ts` is the
   * floor; rows here override on a per-(sku, country) basis at runtime,
   * no deploy required.
   *
   * `country_code` is either an ISO-3166-1 alpha-2 code (uppercase) or
   * the literal "DEFAULT" sentinel for the unmapped fallback. `sku` is
   * a SKU id from `PACK_SKUS` (defaults to the higher-tier Vision Pack
   * to keep legacy callers working). Amounts are stored in **minor
   * units** (cents/piastres), the admin form authors fractional major
   * units (e.g. `19.99`) and the page-level handler does the multiply
   * before invoking the upsert.
   */
  listVisionPackPricing: protectedProcedure
    .input(z.object({ sku: packSkuSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.visionPackPricing.findMany({
        where: input?.sku ? { sku: input.sku } : undefined,
        orderBy: [{ sku: "asc" }, { country_code: "asc" }],
      });
    }),

  upsertVisionPackPricing: protectedProcedure
    .input(
      z.object({
        sku: packSkuSchema,
        country_code: z
          .string()
          .regex(/^([A-Z]{2}|DEFAULT)$/, "Use a 2-letter ISO code or 'DEFAULT'")
          .max(8),
        // Amount in minor units. We allow 0 so admins can stage
        // promotional pricing freely; UI keeps a >= 1 nudge.
        amount: z.number().int().min(0).max(100_000_000),
        currency: z
          .string()
          .length(3)
          .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO 4217 currency code"),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.visionPackPricing.upsert({
        where: {
          sku_country_code: {
            sku: input.sku,
            country_code: input.country_code,
          },
        },
        create: {
          sku: input.sku,
          country_code: input.country_code,
          amount: input.amount,
          currency: input.currency,
          notes: input.notes ?? null,
          updated_by: ctx.user.id,
        },
        update: {
          amount: input.amount,
          currency: input.currency,
          notes: input.notes ?? null,
          updated_by: ctx.user.id,
        },
      });
    }),

  deleteVisionPackPricing: protectedProcedure
    .input(
      z.object({
        sku: packSkuSchema,
        country_code: z.string().max(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      await prisma.visionPackPricing.deleteMany({
        where: { sku: input.sku, country_code: input.country_code },
      });
      return { ok: true };
    }),
});
