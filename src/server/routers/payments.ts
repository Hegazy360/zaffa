import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

const paymentStatusSchema = z.enum([
  "pending",
  "paid",
  "overdue",
  "cancelled",
]);

async function assertEventParticipant(eventId: string, userId: string) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      OR: [{ client_id: userId }, { planner: { user_id: userId } }],
    },
    select: { id: true },
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
    select: { id: true, event_id: true },
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
      await assertOwnsPayment(input.id, ctx.user.id);
      const { id, status, ...rest } = input;

      return prisma.payment.update({
        where: { id },
        data: {
          ...rest,
          status,
          // Mirror status changes onto paid_at so clients can sort/filter on
          // a real timestamp without extra round-trips.
          paid_at:
            status === "paid"
              ? new Date()
              : status === "pending" || status === "overdue" || status === "cancelled"
                ? null
                : undefined,
        },
      });
    }),

  markPaid: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsPayment(input.id, ctx.user.id);
      return prisma.payment.update({
        where: { id: input.id },
        data: { status: "paid", paid_at: new Date() },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsPayment(input.id, ctx.user.id);
      return prisma.payment.delete({ where: { id: input.id } });
    }),
});
