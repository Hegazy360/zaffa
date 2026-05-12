import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { notifyEventInServiceArea } from "@/server/services/notifications/dispatchers";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

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
              style_notes: true,
              references: true,
              media: {
                orderBy: { created_at: "desc" },
                select: { id: true, type: true, url: true, parent_id: true },
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
          // Latest Vision Pack linked to this event (most-recent first).
          // Used by the Overview tab to gate the "Recommended venues"
          // card on the higher-tier SKU. We only need the `sku` and
          // status to decide whether to render and to invalidate when
          // the pack flips.
          vision_packs: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { id: true, sku: true, status: true },
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
      const before = await prisma.event.findUnique({
        where: { id },
        select: { venue: true, client_id: true },
      });
      const updated = await prisma.event.update({
        where: { id },
        data: rest,
      });
      // Fan a "new event in your area" notification the moment the venue
      // is first set on an event with an approved design. Swapping venues
      // also re-fans because the dedupe key is (planner, event) — any
      // previously-notified planners are skipped.
      const venueChanged =
        rest.venue !== undefined &&
        (before?.venue ?? null) !== (rest.venue ?? null);
      if (venueChanged && updated.venue) {
        const hasApprovedDesign = await prisma.venueDesign.findFirst({
          where: { event_id: id, approved_at: { not: null } },
          select: { id: true },
        });
        if (hasApprovedDesign) {
          await notifyEventInServiceArea({
            eventId: id,
            clientUserId: updated.client_id,
            venue: updated.venue,
            eventType: String(updated.event_type),
            eventTitle: updated.title,
          });
        }
      }
      return updated;
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
        select: { id: true, title: true, event_type: true, venue: true, client_id: true },
      });

      await prisma.venueDesign.update({
        where: { id: design.id },
        data: { event_id: event.id, approved_at: new Date() },
      });

      // Two funnel signals fire here: the event itself coming into being,
      // and the design being approved (this is the path that converts a
      // design draft into a real planning artefact).
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.EVENT_CREATED, {
        event_id: event.id,
        event_type: String(event.event_type),
        from: "design_approval",
      });
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_APPROVED, {
        event_id: event.id,
        design_id: design.id,
      });

      // Kick off a fan-out now in case the client already set a venue on
      // the design (rare — venue usually arrives via events.update). This
      // is a no-op when `venue` is empty.
      if (event.venue) {
        await notifyEventInServiceArea({
          eventId: event.id,
          clientUserId: event.client_id,
          venue: event.venue,
          eventType: String(event.event_type),
          eventTitle: event.title,
        });
      }

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

      // Couple-journey funnel — swapping the approved design counts as a
      // re-approval moment. Couples often iterate on this before locking.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_APPROVED, {
        event_id: input.eventId,
        design_id: input.designId,
        swapped: true,
      });

      // Attaching a design can publish an event into the marketplace for
      // the first time. Fan out if there's a venue to match on; planners
      // who were already notified are deduped inside the helper.
      const event = await prisma.event.findUnique({
        where: { id: input.eventId },
        select: {
          id: true,
          title: true,
          event_type: true,
          venue: true,
          client_id: true,
        },
      });
      if (event?.venue) {
        await notifyEventInServiceArea({
          eventId: event.id,
          clientUserId: event.client_id,
          venue: event.venue,
          eventType: String(event.event_type),
          eventTitle: event.title,
        });
      }

      return { ok: true };
    }),
});
