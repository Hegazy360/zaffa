import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  paymentSuccessUrlBase,
  platformName,
  toStripeAmount,
} from "@/lib/payments";
import { reportError } from "@/lib/logger";

// All payment lifecycle now flows through PaymentSchedule -> Stripe Checkout.
// The legacy manual-ledger surface (off-platform cash entries) was removed
// to keep one source of truth, capture the platform fee on every transaction,
// and protect both sides via the Stripe escrow flow.
export const paymentsRouter = router({
  /**
   * The concierge package for one event: schedule-less `Payment` rows.
   *
   * `SchedulePanel` reads `paymentSchedules.forEvent` and is welded to the
   * planner installment model, which requires a proposal and a planner. The
   * concierge lane has neither, so its rows are the ones with
   * `schedule_id = null` and they need their own query.
   */
  conciergeForEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Ownership is checked against the event, not the payment rows — a
      // client may only ever see their own wedding's ledger.
      const event = await prisma.event.findFirst({
        where: { id: input.eventId, client_id: ctx.user.id },
        select: { id: true },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      return prisma.payment.findMany({
        where: { event_id: input.eventId, schedule_id: null },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          label: true,
          amount: true,
          currency: true,
          status: true,
          due_date: true,
          paid_at: true,
          payment_link_url: true,
        },
      });
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

      // Look up the client's email so Stripe can email them a receipt
      // automatically once the payment lands. This is a v1 receipt — VAT /
      // tax-compliant invoices ship in a follow-up. See README "Receipts".
      // Email lives on auth.users (not the public Profile row), so we read
      // it via $queryRaw rather than modelling the auth schema in Prisma.
      let clientEmail: string | null = null;
      try {
        const rows = await prisma.$queryRaw<Array<{ email: string | null }>>(
          Prisma.sql`select email from auth.users where id = ${installment.event.client_id}::uuid limit 1`,
        );
        clientEmail = rows[0]?.email ?? null;
      } catch (err) {
        reportError("payments.checkout.lookupEmail", err, {
          installmentId: installment.id,
        });
      }

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
        ...(clientEmail ? { customer_email: clientEmail } : {}),
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
          // Stripe-hosted receipts emailed automatically when receipt_email is
          // set on the PaymentIntent. customer_email above also works for
          // Checkout, but we belt-and-braces the PaymentIntent path too.
          ...(clientEmail ? { receipt_email: clientEmail } : {}),
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
