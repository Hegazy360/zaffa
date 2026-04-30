import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { getDefaultPlatformFeePct } from "@/lib/payments";

// One row of the planner's proposed plan. due_date is optional so the
// planner can leave dates open ("on signing", "before event", etc.).
const installmentInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  amount: z.number().nonnegative(),
  due_date: z.coerce.date().nullish(),
});

// Status set considered "open" — i.e. not yet collected — and therefore
// editable by an amendment or cancellable on switch/withdraw.
const OPEN_STATUSES = ["pending", "awaiting_payment", "failed"] as const;

async function requireParticipant(eventId: string, userId: string) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      OR: [{ client_id: userId }, { planner: { user_id: userId } }],
    },
    select: { id: true, client_id: true, planner_id: true },
  });
  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
  }
  return event;
}

async function requirePlannerForProposal(proposalId: string, userId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      event_id: true,
      planner_id: true,
      quote_currency: true,
      status: true,
      planner: { select: { user_id: true } },
      event: { select: { client_id: true } },
    },
  });
  if (!proposal) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
  }
  if (proposal.planner.user_id !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the planner who owns this proposal can do that",
    });
  }
  return proposal;
}

export const paymentSchedulesRouter = router({
  // Both sides view the schedule for an event. Returns the active or the
  // most-recent proposed schedule plus its installments and any pending
  // amendment so the UI can render diffs without extra round trips.
  forEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireParticipant(input.eventId, ctx.user.id);
      const schedule = await prisma.paymentSchedule.findFirst({
        where: {
          event_id: input.eventId,
          status: { not: "cancelled" },
        },
        orderBy: [{ updated_at: "desc" }],
        include: {
          installments: {
            orderBy: [{ due_date: "asc" }, { created_at: "asc" }],
          },
          amendments: {
            where: { status: "pending" },
            orderBy: { created_at: "desc" },
            take: 1,
          },
          proposal: {
            select: {
              id: true,
              status: true,
              quote_currency: true,
              quote_amount: true,
            },
          },
        },
      });
      return schedule;
    }),

  // Planner attaches a schedule to their proposal. If they already have a
  // proposed/draft schedule for this event, we replace it. Active or
  // completed schedules are immutable and need an amendment instead.
  propose: protectedProcedure
    .input(
      z.object({
        proposalId: z.string().uuid(),
        currency: z.string().min(2).max(8).optional(),
        platform_fee_pct: z.number().min(0).max(100).optional(),
        installments: z.array(installmentInputSchema).min(1).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await requirePlannerForProposal(
        input.proposalId,
        ctx.user.id
      );
      if (proposal.status === "released" || proposal.status === "declined") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This proposal is no longer active",
        });
      }
      const total = input.installments.reduce(
        (sum, i) => sum + i.amount,
        0
      );
      if (total <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Schedule total must be greater than zero",
        });
      }

      return prisma.$transaction(async (tx) => {
        const replaceable = await tx.paymentSchedule.findFirst({
          where: {
            event_id: proposal.event_id,
            status: { in: ["draft", "proposed"] },
          },
          select: { id: true },
        });
        if (replaceable) {
          // Cascade-delete the orphan draft schedule (and its installments).
          // We only do this for proposed/draft state; active schedules
          // are immutable and require an amendment.
          await tx.paymentSchedule.delete({ where: { id: replaceable.id } });
        }
        const created = await tx.paymentSchedule.create({
          data: {
            event_id: proposal.event_id,
            proposal_id: proposal.id,
            planner_id: proposal.planner_id,
            client_id: proposal.event.client_id,
            currency: input.currency ?? proposal.quote_currency,
            total_amount: total,
            platform_fee_pct:
              input.platform_fee_pct ?? getDefaultPlatformFeePct(),
            status: "proposed",
          },
        });
        await tx.payment.createMany({
          data: input.installments.map((r) => ({
            event_id: proposal.event_id,
            schedule_id: created.id,
            label: r.label,
            amount: r.amount,
            currency: created.currency,
            status: "pending" as const,
            due_date: r.due_date ?? null,
          })),
        });
        return tx.paymentSchedule.findUnique({
          where: { id: created.id },
          include: {
            installments: {
              orderBy: [{ due_date: "asc" }, { created_at: "asc" }],
            },
          },
        });
      });
    }),

  // Client confirms the proposed schedule — flips status to "active" and
  // materialises one Payment row per installment. We also accept the parent
  // proposal so the two states can never drift; the UI calls this from a
  // single button.
  acceptProposed: protectedProcedure
    .input(z.object({ scheduleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await prisma.paymentSchedule.findUnique({
        where: { id: input.scheduleId },
        include: {
          proposal: {
            select: { id: true, status: true, planner_id: true },
          },
          event: { select: { id: true, client_id: true, planner_id: true } },
        },
      });
      if (!schedule) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (schedule.event.client_id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the event owner can accept the schedule",
        });
      }
      if (schedule.status !== "proposed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only proposed schedules can be accepted",
        });
      }

      return prisma.$transaction(async (tx) => {
        // Accept the parent proposal in the same txn so state stays in sync.
        if (schedule.proposal.status === "pending") {
          if (
            schedule.event.planner_id &&
            schedule.event.planner_id !== schedule.proposal.planner_id
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "An active planner is already assigned. Use Switch planner instead.",
            });
          }
          await tx.proposal.update({
            where: { id: schedule.proposal.id },
            data: { status: "accepted", accepted_at: new Date() },
          });
          await tx.event.update({
            where: { id: schedule.event.id },
            data: { planner_id: schedule.proposal.planner_id },
          });
        }

        return tx.paymentSchedule.update({
          where: { id: schedule.id },
          data: { status: "active", accepted_at: new Date() },
          include: {
            installments: {
              orderBy: [{ due_date: "asc" }, { created_at: "asc" }],
            },
          },
        });
      });
    }),

  // Either side proposes new installments for the not-yet-paid portion.
  // We only ever modify "open" installments (pending/awaiting/failed).
  // Already-paid rows stay locked.
  requestAmendment: protectedProcedure
    .input(
      z.object({
        scheduleId: z.string().uuid(),
        installments: z.array(installmentInputSchema).min(1).max(20),
        platform_fee_pct: z.number().min(0).max(100).optional(),
        reason: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedule = await prisma.paymentSchedule.findUnique({
        where: { id: input.scheduleId },
        include: {
          planner: { select: { user_id: true } },
          event: { select: { client_id: true } },
        },
      });
      if (!schedule) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const isPlanner = schedule.planner.user_id === ctx.user.id;
      const isClient = schedule.event.client_id === ctx.user.id;
      if (!isPlanner && !isClient) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (schedule.status !== "active" && schedule.status !== "amended") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only active schedules can be amended",
        });
      }
      const existing = await prisma.scheduleAmendment.findFirst({
        where: { schedule_id: schedule.id, status: "pending" },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An amendment is already pending on this schedule",
        });
      }

      const total = input.installments.reduce((s, i) => s + i.amount, 0);
      return prisma.scheduleAmendment.create({
        data: {
          schedule_id: schedule.id,
          requested_by_user_id: ctx.user.id,
          proposed_installments: input.installments.map((i) => ({
            label: i.label,
            amount: i.amount,
            due_date: i.due_date ? i.due_date.toISOString() : null,
          })),
          proposed_total: total,
          proposed_fee_pct: input.platform_fee_pct,
          reason: input.reason,
        },
      });
    }),

  // The opposite side (the one who didn't request) accepts or rejects.
  decideAmendment: protectedProcedure
    .input(
      z.object({
        amendmentId: z.string().uuid(),
        accept: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const amendment = await prisma.scheduleAmendment.findUnique({
        where: { id: input.amendmentId },
        include: {
          schedule: {
            include: {
              planner: { select: { user_id: true } },
              event: { select: { client_id: true } },
            },
          },
        },
      });
      if (!amendment) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (amendment.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This amendment has already been decided",
        });
      }
      const isPlanner = amendment.schedule.planner.user_id === ctx.user.id;
      const isClient = amendment.schedule.event.client_id === ctx.user.id;
      if (!isPlanner && !isClient) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Can't decide your own amendment.
      if (amendment.requested_by_user_id === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the other party can decide this amendment",
        });
      }

      if (!input.accept) {
        return prisma.scheduleAmendment.update({
          where: { id: amendment.id },
          data: {
            status: "rejected",
            decided_at: new Date(),
            decided_by_user_id: ctx.user.id,
          },
        });
      }

      // Accept: replace open installments with the proposed snapshot.
      const proposed = amendment.proposed_installments as Array<{
        label: string;
        amount: number;
        due_date: string | null;
      }>;
      return prisma.$transaction(async (tx) => {
        await tx.payment.deleteMany({
          where: {
            schedule_id: amendment.schedule_id,
            status: { in: [...OPEN_STATUSES] },
          },
        });
        await tx.payment.createMany({
          data: proposed.map((p) => ({
            event_id: amendment.schedule.event_id,
            schedule_id: amendment.schedule_id,
            label: p.label,
            amount: p.amount,
            currency: amendment.schedule.currency,
            status: "pending" as const,
            due_date: p.due_date ? new Date(p.due_date) : null,
          })),
        });
        await tx.paymentSchedule.update({
          where: { id: amendment.schedule_id },
          data: {
            total_amount: proposed.reduce((s, p) => s + p.amount, 0),
            platform_fee_pct:
              amendment.proposed_fee_pct ??
              amendment.schedule.platform_fee_pct,
            status: "amended",
          },
        });
        return tx.scheduleAmendment.update({
          where: { id: amendment.id },
          data: {
            status: "accepted",
            decided_at: new Date(),
            decided_by_user_id: ctx.user.id,
          },
        });
      });
    }),

  // Withdraw your own pending amendment.
  withdrawAmendment: protectedProcedure
    .input(z.object({ amendmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const amendment = await prisma.scheduleAmendment.findUnique({
        where: { id: input.amendmentId },
        select: {
          id: true,
          requested_by_user_id: true,
          status: true,
        },
      });
      if (!amendment) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (amendment.requested_by_user_id !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (amendment.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending amendments can be withdrawn",
        });
      }
      return prisma.scheduleAmendment.update({
        where: { id: amendment.id },
        data: { status: "withdrawn", decided_at: new Date() },
      });
    }),
});

// Internal helper used by the proposals router on switch / withdraw.
// Cancels every "open" installment (pending/awaiting/failed) on the event's
// active schedule and marks the schedule cancelled. Already-paid rows are
// left attributed to the outgoing planner.
export async function cancelOpenInstallmentsForEvent(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  eventId: string
) {
  const schedule = await tx.paymentSchedule.findFirst({
    where: {
      event_id: eventId,
      status: { in: ["proposed", "active", "amended"] },
    },
    select: { id: true },
  });
  if (!schedule) return;
  await tx.payment.updateMany({
    where: {
      schedule_id: schedule.id,
      status: { in: [...OPEN_STATUSES] },
    },
    data: { status: "cancelled" },
  });
  await tx.paymentSchedule.update({
    where: { id: schedule.id },
    data: { status: "cancelled", cancelled_at: new Date() },
  });
  await tx.scheduleAmendment.updateMany({
    where: { schedule_id: schedule.id, status: "pending" },
    data: { status: "withdrawn", decided_at: new Date() },
  });
}
