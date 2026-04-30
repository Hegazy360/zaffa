import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

const eventTypeSchema = z.enum([
  "wedding",
  "engagement",
  "birthday",
  "corporate",
  "other",
]);

const eventStatusSchema = z.enum([
  "draft",
  "planning",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
]);

// Helper: ensure caller is the event's client_id (or planner_id for the
// planner-side dashboards we'll add later). Only client_id check for now since
// scope is client-only in this pass.
async function assertOwnsEvent(eventId: string, userId: string) {
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

export const eventsRouter = router({
  // List events the user is involved in (client or planner)
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.event.findMany({
      where: {
        OR: [
          { client_id: ctx.user.id },
          { planner: { user_id: ctx.user.id } },
        ],
      },
      orderBy: [{ event_date: "asc" }, { created_at: "desc" }],
      select: {
        id: true,
        title: true,
        event_type: true,
        event_date: true,
        venue: true,
        budget: true,
        status: true,
        created_at: true,
        designs: {
          orderBy: { approved_at: "desc" },
          take: 1,
          select: {
            id: true,
            name: true,
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
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const event = await prisma.event.findFirst({
        where: {
          id: input.id,
          OR: [
            { client_id: ctx.user.id },
            { planner: { user_id: ctx.user.id } },
          ],
        },
        include: {
          client: {
            select: { id: true, full_name: true, avatar_url: true },
          },
          planner: {
            select: {
              id: true,
              business_name: true,
              location: true,
              avg_rating: true,
              profile: {
                select: { full_name: true, avatar_url: true },
              },
            },
          },
          designs: {
            orderBy: [{ approved_at: "desc" }, { updated_at: "desc" }],
            select: {
              id: true,
              name: true,
              thumbnail: true,
              palette: true,
              approved_at: true,
              media: {
                where: { type: "render" },
                orderBy: { created_at: "desc" },
                take: 1,
                select: { url: true },
              },
            },
          },
          vendors: {
            include: {
              vendor: {
                select: {
                  id: true,
                  business_name: true,
                  category: true,
                  location: true,
                },
              },
            },
          },
          payments: {
            orderBy: [{ due_date: "asc" }, { created_at: "asc" }],
          },
        },
      });
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }
      return event;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        event_type: eventTypeSchema.optional(),
        event_date: z.coerce.date().nullish(),
        venue: z.string().max(500).nullish(),
        budget: z.number().nonnegative().nullish(),
        status: eventStatusSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsEvent(input.id, ctx.user.id);
      const { id, ...rest } = input;
      return prisma.event.update({
        where: { id },
        data: rest,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const event = await prisma.event.findFirst({
        where: { id: input.id, client_id: ctx.user.id },
        select: { id: true },
      });
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }
      return prisma.event.delete({ where: { id: input.id } });
    }),

  // Approve primitive: turn a venue design into a real event in one click.
  // Prefills title from the design name, event_type from the design, then
  // links the design back to the new event so the dashboard can render the
  // approved design at the top of the event detail page.
  createFromDesign: protectedProcedure
    .input(z.object({ designId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const design = await prisma.venueDesign.findFirst({
        where: { id: input.designId, user_id: ctx.user.id },
        select: { id: true, name: true, event_type: true, event_id: true },
      });
      if (!design) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Design not found" });
      }

      // If the design is already attached to an event, just bounce the user
      // there — no surprise duplicate events.
      if (design.event_id) {
        return { id: design.event_id };
      }

      // Map loose `event_type` string on VenueDesign to the strict EventType
      // enum on Event. Falls back to `other` if mismatched.
      const allowed = ["wedding", "engagement", "birthday", "corporate", "other"] as const;
      type AllowedEventType = (typeof allowed)[number];
      const normalized: AllowedEventType = (allowed as readonly string[]).includes(design.event_type)
        ? (design.event_type as AllowedEventType)
        : "other";

      const event = await prisma.event.create({
        data: {
          client_id: ctx.user.id,
          title: design.name,
          event_type: normalized,
          status: "planning",
        },
        select: { id: true },
      });

      await prisma.venueDesign.update({
        where: { id: design.id },
        data: { event_id: event.id, approved_at: new Date() },
      });

      return event;
    }),

  // Swap which design is "approved" for an existing event. Detaches any
  // currently-attached designs first so only one design carries `approved_at`
  // at a time per event (mirrors the Overview tab's "the design we're going
  // with" mental model).
  attachDesign: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        designId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsEvent(input.eventId, ctx.user.id);

      const design = await prisma.venueDesign.findFirst({
        where: { id: input.designId, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!design) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Design not found" });
      }

      await prisma.$transaction([
        prisma.venueDesign.updateMany({
          where: { event_id: input.eventId },
          data: { event_id: null, approved_at: null },
        }),
        prisma.venueDesign.update({
          where: { id: input.designId },
          data: { event_id: input.eventId, approved_at: new Date() },
        }),
      ]);

      return { ok: true };
    }),
});
