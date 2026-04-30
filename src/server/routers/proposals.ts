import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

const breakdownRowSchema = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().nonnegative(),
});

const quoteSchema = {
  quote_amount: z.number().nonnegative().nullish(),
  quote_currency: z.string().min(1).max(8).optional(),
  quote_breakdown: z.array(breakdownRowSchema).max(20).nullish(),
};

async function requirePlanner(userId: string) {
  const planner = await prisma.plannerProfile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!planner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only planners can submit proposals",
    });
  }
  return planner;
}

async function requireEventClient(eventId: string, userId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, client_id: userId },
    select: { id: true, planner_id: true },
  });
  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
  }
  return event;
}

export const proposalsRouter = router({
  // Planner-side: list my proposals across all events with grouping data so
  // the proposals page can split into tabs.
  mine: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(["pending", "accepted", "released", "declined"]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const proposals = await prisma.proposal.findMany({
        where: {
          planner_id: planner.id,
          ...(input?.status ? { status: input.status } : {}),
        },
        orderBy: [{ updated_at: "desc" }],
        select: {
          id: true,
          status: true,
          cover_letter: true,
          quote_amount: true,
          quote_currency: true,
          quote_breakdown: true,
          accepted_at: true,
          released_at: true,
          release_reason: true,
          release_rating: true,
          created_at: true,
          updated_at: true,
          event: {
            select: {
              id: true,
              title: true,
              event_type: true,
              event_date: true,
              venue: true,
              budget: true,
              status: true,
              planner_id: true,
              client: { select: { full_name: true } },
              designs: {
                where: { approved_at: { not: null } },
                orderBy: { approved_at: "desc" },
                take: 1,
                select: {
                  thumbnail: true,
                  palette: true,
                  media: {
                    where: { type: "render" },
                    orderBy: { created_at: "desc" },
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
          },
        },
      });

      return proposals.map((p) => {
        const design = p.event.designs[0];
        const heroImage = design?.media[0]?.url ?? design?.thumbnail ?? null;
        const firstName =
          p.event.client.full_name.split(" ")[0] ?? p.event.client.full_name;
        return {
          ...p,
          event: {
            id: p.event.id,
            title: p.event.title,
            event_type: p.event.event_type,
            event_date: p.event.event_date,
            venue: p.event.venue,
            budget: p.event.budget,
            status: p.event.status,
            client_first_name: firstName,
            heroImage,
            palette: design?.palette ?? null,
            // True when this event is currently engaged with a different
            // planner — gives the planner the "Backup" hint.
            engaged_with_other:
              p.event.planner_id !== null && p.status === "pending",
          },
        };
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        coverLetter: z.string().min(20).max(5000),
        ...quoteSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);

      // Event must have an approved design and not already have this planner
      // proposing on it.
      const event = await prisma.event.findFirst({
        where: {
          id: input.eventId,
          designs: { some: { approved_at: { not: null } } },
        },
        select: { id: true },
      });
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }

      const existing = await prisma.proposal.findUnique({
        where: {
          event_id_planner_id: {
            event_id: input.eventId,
            planner_id: planner.id,
          },
        },
        select: { id: true, status: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have a proposal on this event",
        });
      }

      return prisma.proposal.create({
        data: {
          event_id: input.eventId,
          planner_id: planner.id,
          cover_letter: input.coverLetter,
          quote_amount: input.quote_amount ?? null,
          quote_currency: input.quote_currency ?? "EGP",
          quote_breakdown: input.quote_breakdown ?? undefined,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        coverLetter: z.string().min(20).max(5000).optional(),
        ...quoteSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const proposal = await prisma.proposal.findFirst({
        where: { id: input.id, planner_id: planner.id },
        select: { id: true, status: true },
      });
      if (!proposal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      }
      // You can only edit while still pending. Once accepted/released the
      // numbers are locked.
      if (proposal.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending proposals can be edited",
        });
      }
      const { id, coverLetter, ...rest } = input;
      return prisma.proposal.update({
        where: { id },
        data: {
          ...(coverLetter !== undefined ? { cover_letter: coverLetter } : {}),
          ...(rest.quote_amount !== undefined
            ? { quote_amount: rest.quote_amount }
            : {}),
          ...(rest.quote_currency !== undefined
            ? { quote_currency: rest.quote_currency }
            : {}),
          ...(rest.quote_breakdown !== undefined
            ? { quote_breakdown: rest.quote_breakdown ?? undefined }
            : {}),
        },
      });
    }),

  withdraw: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const proposal = await prisma.proposal.findFirst({
        where: { id: input.id, planner_id: planner.id },
        select: { id: true, status: true, event_id: true },
      });
      if (!proposal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      }
      if (proposal.status === "released" || proposal.status === "declined") {
        return proposal;
      }

      // If the planner is currently engaged on this event, withdrawing also
      // detaches them from the event so the brief reopens.
      return prisma.$transaction(async (tx) => {
        if (proposal.status === "accepted") {
          await tx.event.update({
            where: { id: proposal.event_id },
            data: { planner_id: null },
          });
        }
        return tx.proposal.update({
          where: { id: input.id },
          data: { status: "declined" },
        });
      });
    }),

  // Client-side: every proposal on an event with the planner's public-facing
  // profile bits. Authorization: must be the event owner.
  byEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireEventClient(input.eventId, ctx.user.id);
      const proposals = await prisma.proposal.findMany({
        where: { event_id: input.eventId },
        orderBy: [{ status: "asc" }, { created_at: "desc" }],
        select: {
          id: true,
          status: true,
          cover_letter: true,
          quote_amount: true,
          quote_currency: true,
          quote_breakdown: true,
          accepted_at: true,
          released_at: true,
          release_reason: true,
          release_rating: true,
          created_at: true,
          planner: {
            select: {
              id: true,
              business_name: true,
              bio: true,
              location: true,
              specialties: true,
              avg_rating: true,
              review_count: true,
              verified: true,
              profile: {
                select: { full_name: true, avatar_url: true },
              },
              portfolio_items: {
                take: 4,
                orderBy: { created_at: "desc" },
                select: {
                  id: true,
                  image_url: true,
                  caption: true,
                },
              },
              reviews: {
                take: 2,
                orderBy: { created_at: "desc" },
                select: {
                  id: true,
                  rating: true,
                  comment: true,
                  author: { select: { full_name: true } },
                },
              },
            },
          },
        },
      });
      return proposals;
    }),

  accept: protectedProcedure
    .input(z.object({ proposalId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Make sure the caller owns the event.
      const proposal = await prisma.proposal.findUnique({
        where: { id: input.proposalId },
        select: {
          id: true,
          event_id: true,
          planner_id: true,
          status: true,
        },
      });
      if (!proposal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      }
      const event = await requireEventClient(proposal.event_id, ctx.user.id);
      if (event.planner_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "An active planner is already assigned. Use Switch planner to replace them.",
        });
      }
      if (proposal.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending proposals can be accepted",
        });
      }

      return prisma.$transaction(async (tx) => {
        const updated = await tx.proposal.update({
          where: { id: input.proposalId },
          data: {
            status: "accepted",
            accepted_at: new Date(),
          },
        });
        await tx.event.update({
          where: { id: proposal.event_id },
          data: { planner_id: proposal.planner_id },
        });
        return updated;
      });
    }),

  // Switch the active planner. Atomically:
  //   1. Releases the outgoing proposal (records reason + rating)
  //   2. Writes a Review on the outgoing planner
  //   3. Accepts the incoming proposal
  //   4. Updates Event.planner_id to the new planner
  //   5. Recomputes the outgoing planner's avg_rating + review_count
  // Other pending proposals stay pending (per product decision: client may
  // switch again later without auto-rejecting backups).
  switch: protectedProcedure
    .input(
      z.object({
        fromProposalId: z.string().uuid(),
        toProposalId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        reason: z.string().min(10).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [from, to] = await Promise.all([
        prisma.proposal.findUnique({
          where: { id: input.fromProposalId },
          select: {
            id: true,
            event_id: true,
            planner_id: true,
            status: true,
          },
        }),
        prisma.proposal.findUnique({
          where: { id: input.toProposalId },
          select: {
            id: true,
            event_id: true,
            planner_id: true,
            status: true,
          },
        }),
      ]);
      if (!from || !to) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      }
      if (from.event_id !== to.event_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Proposals must belong to the same event",
        });
      }
      const event = await requireEventClient(from.event_id, ctx.user.id);
      if (from.status !== "accepted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Outgoing proposal must currently be the active one",
        });
      }
      if (to.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Incoming proposal must still be pending",
        });
      }
      if (event.planner_id !== from.planner_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Outgoing planner is no longer engaged",
        });
      }

      return prisma.$transaction(async (tx) => {
        const now = new Date();

        await tx.proposal.update({
          where: { id: from.id },
          data: {
            status: "released",
            released_at: now,
            release_reason: input.reason,
            release_rating: input.rating,
          },
        });

        // Use upsert keyed on (author, planner, event) so re-engaging and
        // re-releasing the same planner updates the existing review instead
        // of failing the unique constraint.
        await tx.review.upsert({
          where: {
            author_id_planner_id_event_id: {
              author_id: ctx.user.id,
              planner_id: from.planner_id,
              event_id: from.event_id,
            },
          },
          create: {
            author_id: ctx.user.id,
            planner_id: from.planner_id,
            event_id: from.event_id,
            rating: input.rating,
            comment: input.reason,
          },
          update: {
            rating: input.rating,
            comment: input.reason,
          },
        });

        await tx.proposal.update({
          where: { id: to.id },
          data: {
            status: "accepted",
            accepted_at: now,
          },
        });

        await tx.event.update({
          where: { id: from.event_id },
          data: { planner_id: to.planner_id },
        });

        // Recompute aggregates on the released planner so their card stays
        // accurate without a separate worker.
        const agg = await tx.review.aggregate({
          where: { planner_id: from.planner_id },
          _avg: { rating: true },
          _count: { _all: true },
        });
        await tx.plannerProfile.update({
          where: { id: from.planner_id },
          data: {
            avg_rating: agg._avg.rating ?? 0,
            review_count: agg._count._all,
          },
        });

        return { ok: true };
      });
    }),
});
