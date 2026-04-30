import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  paymentSuccessUrlBase,
  platformName,
  toStripeAmount,
} from "@/lib/payments";

const paymentStatusSchema = z.enum([
  "pending",
  "awaiting_payment",
  "processing",
  "paid",
  "failed",
  "refunded",
  "overdue",
  "cancelled",
]);

async function assertEventParticipant(eventId: string, userId: string) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      OR: [{ client_id: userId }, { planner: { user_id: userId } }],
    },
    select: { id: true, client_id: true },
  });
  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
  }
  return event;
}

async function assertOwnsPayment(paymentId: string, userId: string) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      event: {
        OR: [{ client_id: userId }, { planner: { user_id: userId } }],
      },
    },
    select: {
      id: true,
      event_id: true,
      schedule_id: true,
      status: true,
    },
  });
  if (!payment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
  }
  return payment;
}

export const paymentsRouter = router({
  byEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertEventParticipant(input.eventId, ctx.user.id);
      return prisma.payment.findMany({
        where: { event_id: input.eventId },
        orderBy: [{ due_date: "asc" }, { created_at: "asc" }],
      });
    }),

  // Legacy manual ledger row creation. Only allowed for rows NOT linked to
  // a schedule — schedule-bound rows are managed via paymentSchedules.
  // Useful for offline / cash payments either side wants to record.
  create: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        label: z.string().min(1).max(200),
        amount: z.number().nonnegative(),
        currency: z.string().min(2).max(8).default("EGP"),
        status: paymentStatusSchema.default("pending"),
        due_date: z.coerce.date().nullish(),
        notes: z.string().max(2000).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertEventParticipant(input.eventId, ctx.user.id);
      return prisma.payment.create({
        data: {
          event_id: input.eventId,
          label: input.label,
          amount: input.amount,
          currency: input.currency,
          status: input.status,
          due_date: input.due_date,
          notes: input.notes,
          paid_at: input.status === "paid" ? new Date() : null,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        label: z.string().min(1).max(200).optional(),
        amount: z.number().nonnegative().optional(),
        currency: z.string().min(2).max(8).optional(),
        status: paymentStatusSchema.optional(),
        due_date: z.coerce.date().nullish(),
        notes: z.string().max(2000).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await assertOwnsPayment(input.id, ctx.user.id);
      // Schedule-bound rows are immutable except via amendments; the only
      // status-related field that's editable is `notes`, so we strip the
      // others when this is a Stripe-tracked row.
      const isLegacy = existing.schedule_id === null;
      const { id, status, ...rest } = input;
      const data = isLegacy
        ? {
            ...rest,
            status,
            paid_at:
              status === "paid"
                ? new Date()
                : status === "pending" ||
                    status === "overdue" ||
                    status === "cancelled" ||
                    status === "failed"
                  ? null
                  : undefined,
          }
        : { notes: rest.notes };

      return prisma.payment.update({ where: { id }, data });
    }),

  // Manual mark-paid only for legacy ledger rows. Schedule-bound rows must
  // go through Stripe Checkout so we can compute fees.
  markPaid: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await assertOwnsPayment(input.id, ctx.user.id);
      if (existing.schedule_id !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Schedule installments can't be marked paid manually. Pay via Stripe instead.",
        });
      }
      return prisma.payment.update({
        where: { id: input.id },
        data: { status: "paid", paid_at: new Date() },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await assertOwnsPayment(input.id, ctx.user.id);
      if (existing.schedule_id !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Schedule installments can't be deleted directly. Request an amendment instead.",
        });
      }
      return prisma.payment.delete({ where: { id: input.id } });
    }),

  // Client-only: opens a Stripe Checkout Session for a single installment.
  // Returns the URL the client should redirect to.
  createCheckoutSession: protectedProcedure
    .input(z.object({ installmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const installment = await prisma.payment.findUnique({
        where: { id: input.installmentId },
        include: {
          event: { select: { id: true, client_id: true, title: true } },
          schedule: {
            select: {
              id: true,
              status: true,
              currency: true,
              planner_id: true,
            },
          },
        },
      });
      if (!installment) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (installment.event.client_id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the event's client can pay an installment",
        });
      }
      if (!installment.schedule) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This payment is not linked to a schedule and can't be paid online",
        });
      }
      if (
        installment.schedule.status !== "active" &&
        installment.schedule.status !== "amended"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Schedule isn't active",
        });
      }
      if (installment.status !== "pending" && installment.status !== "failed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Installment is ${installment.status}`,
        });
      }

      const stripe = getStripe();
      const amount = Number(installment.amount);
      const currency = installment.currency.toLowerCase();
      const baseUrl = paymentSuccessUrlBase();
      const successUrl = `${baseUrl}/dashboard/client/event/${installment.event.id}?tab=payments&paid=${installment.id}`;
      const cancelUrl = `${baseUrl}/dashboard/client/event/${installment.event.id}?tab=payments&cancelled=${installment.id}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `${platformName()} — ${installment.label}`,
                description: installment.event.title,
              },
              unit_amount: toStripeAmount(amount, installment.currency),
            },
            quantity: 1,
          },
        ],
        metadata: {
          installmentId: installment.id,
          scheduleId: installment.schedule.id,
          eventId: installment.event.id,
          plannerId: installment.schedule.planner_id,
          clientId: installment.event.client_id,
        },
        payment_intent_data: {
          metadata: {
            installmentId: installment.id,
            scheduleId: installment.schedule.id,
            eventId: installment.event.id,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      await prisma.payment.update({
        where: { id: installment.id },
        data: {
          status: "awaiting_payment",
          stripe_checkout_session_id: session.id,
        },
      });

      return { url: session.url, id: session.id };
    }),
});
