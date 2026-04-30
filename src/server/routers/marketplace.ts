import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

// Marketplace is planner-only. Make sure the caller has a PlannerProfile and
// return its id so downstream queries can scope `hasProposed` correctly.
async function assertIsPlanner(userId: string) {
  const planner = await prisma.plannerProfile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!planner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Marketplace is for planners only",
    });
  }
  return planner;
}

const eventTypeSchema = z.enum([
  "wedding",
  "engagement",
  "birthday",
  "corporate",
  "other",
]);

export const marketplaceRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          event_type: eventTypeSchema.optional(),
          has_budget: z.boolean().optional(),
          date_from: z.coerce.date().nullish(),
          date_to: z.coerce.date().nullish(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const planner = await assertIsPlanner(ctx.user.id);

      const events = await prisma.event.findMany({
        where: {
          planner_id: null,
          designs: { some: { approved_at: { not: null } } },
          ...(input?.event_type ? { event_type: input.event_type } : {}),
          ...(input?.has_budget ? { budget: { not: null } } : {}),
          ...(input?.date_from || input?.date_to
            ? {
                event_date: {
                  ...(input?.date_from ? { gte: input.date_from } : {}),
                  ...(input?.date_to ? { lte: input.date_to } : {}),
                },
              }
            : {}),
        },
        orderBy: [{ created_at: "desc" }],
        select: {
          id: true,
          title: true,
          event_type: true,
          event_date: true,
          venue: true,
          budget: true,
          created_at: true,
          client: {
            select: { full_name: true },
          },
          designs: {
            where: { approved_at: { not: null } },
            orderBy: { approved_at: "desc" },
            take: 1,
            select: {
              id: true,
              palette: true,
              thumbnail: true,
              media: {
                where: { type: "render" },
                orderBy: { created_at: "desc" },
                take: 1,
                select: { url: true },
              },
            },
          },
          proposals: {
            where: { planner_id: planner.id },
            select: { id: true, status: true },
            take: 1,
          },
        },
      });

      return events.map((e) => {
        // Only expose first name to keep client identity private until
        // a planner is selected.
        const firstName = e.client.full_name.split(" ")[0] ?? e.client.full_name;
        const design = e.designs[0];
        const heroImage = design?.media[0]?.url ?? design?.thumbnail ?? null;
        return {
          id: e.id,
          title: e.title,
          event_type: e.event_type,
          event_date: e.event_date,
          venue: e.venue,
          budget: e.budget,
          created_at: e.created_at,
          client_first_name: firstName,
          design: design
            ? {
                id: design.id,
                palette: design.palette,
                heroImage,
              }
            : null,
          myProposal: e.proposals[0] ?? null,
        };
      });
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const planner = await assertIsPlanner(ctx.user.id);

      const event = await prisma.event.findFirst({
        where: {
          id: input.id,
          // Either still open (planner_id null) or this planner has a
          // proposal on it (so they can still see their backup application
          // even if another planner is currently active).
          OR: [
            { planner_id: null },
            { proposals: { some: { planner_id: planner.id } } },
          ],
          designs: { some: { approved_at: { not: null } } },
        },
        select: {
          id: true,
          title: true,
          event_type: true,
          event_date: true,
          venue: true,
          budget: true,
          status: true,
          created_at: true,
          planner_id: true,
          client: {
            select: { full_name: true },
          },
          designs: {
            where: { approved_at: { not: null } },
            orderBy: { approved_at: "desc" },
            take: 1,
            select: {
              id: true,
              name: true,
              palette: true,
              thumbnail: true,
              setting: true,
              size: true,
              style_notes: true,
              references: true,
              media: {
                orderBy: { created_at: "desc" },
                select: { id: true, type: true, url: true, parent_id: true },
              },
            },
          },
          proposals: {
            where: { planner_id: planner.id },
            select: {
              id: true,
              status: true,
              cover_letter: true,
              quote_amount: true,
              quote_currency: true,
              quote_breakdown: true,
              created_at: true,
              updated_at: true,
            },
            take: 1,
          },
        },
      });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brief not found" });
      }

      const firstName = event.client.full_name.split(" ")[0] ?? event.client.full_name;
      return {
        id: event.id,
        title: event.title,
        event_type: event.event_type,
        event_date: event.event_date,
        venue: event.venue,
        budget: event.budget,
        status: event.status,
        created_at: event.created_at,
        is_open: event.planner_id === null,
        client_first_name: firstName,
        design: event.designs[0] ?? null,
        myProposal: event.proposals[0] ?? null,
      };
    }),
});
