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

// All payment lifecycle now flows through PaymentSchedule -> Stripe Checkout.
// The legacy manual-ledger surface (off-platform cash entries) was removed
// to keep one source of truth, capture the platform fee on every transaction,
// and protect both sides via the Stripe escrow flow.
export const paymentsRouter = router({
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
