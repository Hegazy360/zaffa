// Venues — admin-curated directory + per-event recommendations.
//
// Two surfaces share one router:
//   - Admin (CRUD + recommend/unrecommend): operations team curates the
//     directory and decides which venues fit each higher-tier Vision
//     Pack event.
//   - Couple (read + expressInterest/dismiss): the recipient of a
//     recommendation sees curated venue cards on their event page and
//     either signals interest (creates an internal lead for ops to
//     facilitate the introduction) or dismisses the card.
//
// There's no public venue browse yet; the marketing surface stays
// closed until v2 of the venue product (when venues sign in for
// themselves and we open the directory).

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/logger";
import { notifyVenueLeadOpened } from "@/server/services/notifications/dispatchers";

async function assertAdmin(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
}

/**
 * Slugify a venue name into a URL-safe handle. Used by `create` when
 * the admin doesn't supply a slug explicitly. Keeps it short and
 * deterministic so re-creating a venue with the same name lands the
 * same slug (and the unique constraint surfaces the conflict early).
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

const venueInputSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, digits, and dashes only")
    .optional(),
  description: z.string().max(4000).optional().nullable(),
  country: z.string().regex(/^[A-Z]{2}$/, "Use a 2-letter ISO country code"),
  city: z.string().min(1).max(120),
  address: z.string().max(400).optional().nullable(),
  capacity_min: z.number().int().min(0).max(100_000).optional().nullable(),
  capacity_max: z.number().int().min(0).max(100_000).optional().nullable(),
  price_tier: z.string().max(8).optional().nullable(),
  styles: z.array(z.string().min(1).max(40)).max(20).default([]),
  amenities: z.array(z.string().min(1).max(40)).max(40).default([]),
  contact_name: z.string().max(120).optional().nullable(),
  contact_email: z.string().email().max(200).optional().nullable(),
  contact_phone: z.string().max(40).optional().nullable(),
  website: z.string().url().max(500).optional().nullable(),
  cover_image: z.string().url().max(800).optional().nullable(),
  published: z.boolean().default(true),
});

export const venuesRouter = router({
  // ----- Admin: directory CRUD -----

  /** Paginated list of all venues for the admin directory. */
  adminList: protectedProcedure
    .input(
      z
        .object({
          query: z.string().max(120).optional(),
          country: z.string().regex(/^[A-Z]{2}$/).optional(),
          publishedOnly: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).default(50),
          cursor: z.string().datetime().nullish(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const limit = input?.limit ?? 50;
      const cursorDate = input?.cursor ? new Date(input.cursor) : null;
      const items = await prisma.venue.findMany({
        where: {
          ...(cursorDate ? { created_at: { lt: cursorDate } } : {}),
          ...(input?.country ? { country: input.country } : {}),
          ...(input?.publishedOnly ? { published: true } : {}),
          ...(input?.query
            ? {
                OR: [
                  { name: { contains: input.query, mode: "insensitive" } },
                  { city: { contains: input.query, mode: "insensitive" } },
                  { slug: { contains: input.query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { created_at: "desc" },
        take: limit + 1,
        include: {
          images: { orderBy: { position: "asc" } },
          _count: { select: { recommendations: true } },
        },
      });
      const nextCursor =
        items.length > limit
          ? items[limit]!.created_at.toISOString()
          : null;
      return { items: items.slice(0, limit), nextCursor };
    }),

  /** Full venue payload for the editor page. */
  adminGet: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const venue = await prisma.venue.findUnique({
        where: { id: input.id },
        include: { images: { orderBy: { position: "asc" } } },
      });
      if (!venue) throw new TRPCError({ code: "NOT_FOUND" });
      return venue;
    }),

  /** Lookup helper for the recommend-venue picker on the admin event view. */
  adminSearch: protectedProcedure
    .input(
      z.object({
        query: z.string().max(120).optional(),
        country: z.string().regex(/^[A-Z]{2}$/).optional(),
        limit: z.number().int().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.venue.findMany({
        where: {
          published: true,
          ...(input.country ? { country: input.country } : {}),
          ...(input.query
            ? {
                OR: [
                  { name: { contains: input.query, mode: "insensitive" } },
                  { city: { contains: input.query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ city: "asc" }, { name: "asc" }],
        take: input.limit,
        select: {
          id: true,
          name: true,
          city: true,
          country: true,
          cover_image: true,
          capacity_min: true,
          capacity_max: true,
          price_tier: true,
        },
      });
    }),

  adminCreate: protectedProcedure
    .input(venueInputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const slug = (input.slug ?? slugify(input.name)).trim();
      if (!slug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not derive a slug from the venue name",
        });
      }
      try {
        return await prisma.venue.create({
          data: {
            name: input.name,
            slug,
            description: input.description ?? null,
            country: input.country,
            city: input.city,
            address: input.address ?? null,
            capacity_min: input.capacity_min ?? null,
            capacity_max: input.capacity_max ?? null,
            price_tier: input.price_tier ?? null,
            styles: input.styles,
            amenities: input.amenities,
            contact_name: input.contact_name ?? null,
            contact_email: input.contact_email ?? null,
            contact_phone: input.contact_phone ?? null,
            website: input.website ?? null,
            cover_image: input.cover_image ?? null,
            published: input.published,
          },
        });
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: string }).code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A venue with slug "${slug}" already exists`,
          });
        }
        throw err;
      }
    }),

  adminUpdate: protectedProcedure
    .input(
      venueInputSchema.partial().extend({ id: z.string().uuid() }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const { id, ...rest } = input;
      return prisma.venue.update({
        where: { id },
        data: {
          ...rest,
          // Coerce undefined → no-op vs. `null` → clear, mirroring the
          // pattern from other admin update routers.
          description: rest.description ?? undefined,
          address: rest.address ?? undefined,
          contact_name: rest.contact_name ?? undefined,
          contact_email: rest.contact_email ?? undefined,
          contact_phone: rest.contact_phone ?? undefined,
          website: rest.website ?? undefined,
          cover_image: rest.cover_image ?? undefined,
          price_tier: rest.price_tier ?? undefined,
          capacity_min: rest.capacity_min ?? undefined,
          capacity_max: rest.capacity_max ?? undefined,
        },
      });
    }),

  adminDelete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      await prisma.venue.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /** Append an image URL to a venue. The actual upload lives in the
   *  `/api/upload/venue-image` route — this just records the URL. */
  adminAddImage: protectedProcedure
    .input(
      z.object({
        venue_id: z.string().uuid(),
        url: z.string().url().max(800),
        alt: z.string().max(200).optional(),
        position: z.number().int().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const lastPosition = input.position
        ?? (
          await prisma.venueImage.aggregate({
            where: { venue_id: input.venue_id },
            _max: { position: true },
          })
        )._max.position
        ?? 0;
      return prisma.venueImage.create({
        data: {
          venue_id: input.venue_id,
          url: input.url,
          alt: input.alt ?? null,
          position: lastPosition + 1,
        },
      });
    }),

  adminRemoveImage: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      await prisma.venueImage.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  // ----- Admin: per-event recommendations -----

  /** All recommendations curated for one event. Used by the admin event
   *  view and (with a different filter) by the couple-facing surface. */
  adminListForEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.eventVenueRecommendation.findMany({
        where: { event_id: input.eventId },
        orderBy: [{ position: "asc" }, { created_at: "desc" }],
        include: { venue: { include: { images: { orderBy: { position: "asc" } } } } },
      });
    }),

  adminRecommend: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        venueId: z.string().uuid(),
        note: z.string().max(2000).optional(),
        position: z.number().int().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      // Ensure the event exists before creating the recommendation row
      // — surfaces a clearer error than the FK violation.
      const event = await prisma.event.findUnique({
        where: { id: input.eventId },
        select: { id: true },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      try {
        return await prisma.eventVenueRecommendation.create({
          data: {
            event_id: input.eventId,
            venue_id: input.venueId,
            note: input.note ?? null,
            position: input.position ?? 0,
            created_by: ctx.user.id,
          },
          include: { venue: { include: { images: { orderBy: { position: "asc" } } } } },
        });
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: string }).code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This venue is already recommended for this event",
          });
        }
        throw err;
      }
    }),

  adminUpdateRecommendation: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        note: z.string().max(2000).optional(),
        position: z.number().int().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.eventVenueRecommendation.update({
        where: { id: input.id },
        data: {
          note: input.note ?? undefined,
          position: input.position ?? undefined,
        },
      });
    }),

  adminUnrecommend: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      await prisma.eventVenueRecommendation.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  // ----- Couple-facing -----

  /** Recommendations the couple should see on their event page. */
  myRecommendationsForEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const event = await prisma.event.findFirst({
        where: { id: input.eventId, client_id: ctx.user.id },
        select: { id: true },
      });
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }
      return prisma.eventVenueRecommendation.findMany({
        where: {
          event_id: input.eventId,
          dismissed_at: null,
        },
        orderBy: [{ position: "asc" }, { created_at: "desc" }],
        include: {
          venue: {
            include: { images: { orderBy: { position: "asc" } } },
          },
        },
      });
    }),

  /** Couple clicked "I'm interested" — stamp the timestamp and ping ops. */
  expressInterest: protectedProcedure
    .input(z.object({ recommendationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await prisma.eventVenueRecommendation.findUnique({
        where: { id: input.recommendationId },
        include: {
          event: {
            select: { id: true, title: true, client_id: true },
          },
          venue: {
            select: { id: true, name: true, city: true, country: true },
          },
        },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      if (rec.event.client_id !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Idempotent — clicking twice is a no-op for ops, the timestamp
      // doesn't move and we don't spawn duplicate notifications.
      if (rec.interested_at) return { ok: true, alreadyInterested: true };

      const updated = await prisma.eventVenueRecommendation.update({
        where: { id: rec.id },
        data: { interested_at: new Date() },
        select: { id: true, interested_at: true },
      });

      // Couple's display name for the ops notification body.
      const profile = await prisma.profile.findUnique({
        where: { id: rec.event.client_id },
        select: { full_name: true },
      });

      try {
        await notifyVenueLeadOpened({
          eventId: rec.event.id,
          eventTitle: rec.event.title,
          recommendationId: rec.id,
          venueName: rec.venue.name,
          venueCity: rec.venue.city,
          coupleName: profile?.full_name ?? "A couple",
        });
      } catch (err) {
        // Don't fail the user-facing mutation on a notification glitch —
        // the recommendation row is already updated.
        reportError("venues.expressInterest.notify_failed", err, {
          recommendationId: rec.id,
        });
      }
      return { ok: true, alreadyInterested: false, interested_at: updated.interested_at };
    }),

  /** Soft-hide a recommendation from the couple's event page. */
  dismiss: protectedProcedure
    .input(z.object({ recommendationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await prisma.eventVenueRecommendation.findUnique({
        where: { id: input.recommendationId },
        select: { id: true, event: { select: { client_id: true } } },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      if (rec.event.client_id !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await prisma.eventVenueRecommendation.update({
        where: { id: rec.id },
        data: { dismissed_at: new Date() },
      });
      return { ok: true };
    }),
});
