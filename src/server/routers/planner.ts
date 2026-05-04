import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { cloudinary } from "@/lib/cloudinary";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

const eventTypeSchema = z.enum([
  "wedding",
  "engagement",
  "birthday",
  "corporate",
  "other",
]);

async function requirePlanner(userId: string) {
  const planner = await prisma.plannerProfile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!planner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Planner profile required",
    });
  }
  return planner;
}

export const plannerRouter = router({
  // Planner profile by id. Used on `/planners/[id]` and the dashboard
  // event view's planner card. Authenticated only — the public browse
  // surface is currently gated behind the `publicBrowse` flag, so we
  // don't want this procedure callable by anonymous clients either.
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const planner = await prisma.plannerProfile.findUnique({
        where: { id: input.id },
        include: {
          profile: {
            select: { full_name: true, avatar_url: true },
          },
          portfolio_items: {
            orderBy: { created_at: "desc" },
          },
          reviews: {
            orderBy: { created_at: "desc" },
            take: 12,
            include: {
              author: { select: { full_name: true, avatar_url: true } },
            },
          },
        },
      });
      if (!planner) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planner not found",
        });
      }
      return planner;
    }),

  // Planner directory used by `/planners`. Supports a basic location
  // prefix match, a free-text query against business_name + bio, and an
  // optional `verifiedOnly` toggle. Cursor-paginated. Authenticated-only
  // for the same reason as `byId` — the public surface is dark-shipped
  // behind the `publicBrowse` flag.
  list: protectedProcedure
    .input(
      z.object({
        location: z.string().trim().max(120).optional(),
        query: z.string().trim().max(200).optional(),
        verifiedOnly: z.boolean().optional(),
        take: z.number().int().min(1).max(60).default(24),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};
      if (input.verifiedOnly) where.verified = true;
      if (input.location && input.location.length > 0) {
        where.location = { contains: input.location, mode: "insensitive" };
      }
      if (input.query && input.query.length > 0) {
        where.OR = [
          { business_name: { contains: input.query, mode: "insensitive" } },
          { bio: { contains: input.query, mode: "insensitive" } },
        ];
      }
      const items = await prisma.plannerProfile.findMany({
        where,
        orderBy: [
          { verified: "desc" },
          { avg_rating: "desc" },
          { review_count: "desc" },
          { created_at: "desc" },
        ],
        take: input.take + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          profile: { select: { full_name: true, avatar_url: true } },
          portfolio_items: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { id: true, image_url: true, caption: true },
          },
          _count: { select: { reviews: true, portfolio_items: true } },
        },
      });
      const hasMore = items.length > input.take;
      const trimmed = hasMore ? items.slice(0, -1) : items;
      return {
        items: trimmed,
        nextCursor: hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null,
      };
    }),

  // Returns the caller's planner profile or null if they aren't a planner.
  // Pages that need to gate on "is planner?" use this to decide whether to
  // show a setup flow vs. the main dashboard.
  me: protectedProcedure.query(async ({ ctx }) => {
    return prisma.plannerProfile.findUnique({
      where: { user_id: ctx.user.id },
      include: {
        profile: { select: { full_name: true, avatar_url: true } },
        portfolio_items: { orderBy: { created_at: "desc" } },
      },
    });
  }),

  update: protectedProcedure
    .input(
      z.object({
        business_name: z.string().min(1).max(120),
        bio: z.string().max(2000).nullish(),
        location: z.string().max(120).nullish(),
        specialties: z.array(z.string().min(1).max(40)).max(20).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Upsert: a freshly signed-up planner has a Profile row but no
      // PlannerProfile yet. First save creates it; subsequent saves update
      // in place. Also flips Profile.role to "planner" so role-based redirects
      // and gating land them in the right console.
      const existing = await prisma.plannerProfile.findUnique({
        where: { user_id: ctx.user.id },
        select: { id: true },
      });

      if (!existing) {
        const created = await prisma.plannerProfile.create({
          data: {
            user_id: ctx.user.id,
            business_name: input.business_name,
            bio: input.bio ?? null,
            location: input.location ?? null,
            specialties: input.specialties ?? [],
          },
        });
        await prisma.profile.update({
          where: { id: ctx.user.id },
          data: { role: "planner" },
        });
        // Activation funnel — fired only on the no-profile → has-profile
        // transition so re-saves don't repeatedly inflate the funnel.
        await trackServer(ctx.user.id, ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
          role: "planner",
        });
        await trackServer(ctx.user.id, ANALYTICS_EVENTS.PROFILE_PUBLISHED, {
          role: "planner",
          planner_id: created.id,
        });
        return created;
      }

      return prisma.plannerProfile.update({
        where: { user_id: ctx.user.id },
        data: {
          business_name: input.business_name,
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.specialties !== undefined
            ? { specialties: input.specialties }
            : {}),
        },
      });
    }),

  // Returns the planner's service-area (country + cities list). Powers the
  // settings editor and the "set your service area to get matched" banner
  // on the planner dashboard.
  serviceArea: protectedProcedure.query(async ({ ctx }) => {
    const planner = await prisma.plannerProfile.findUnique({
      where: { user_id: ctx.user.id },
      select: { service_country: true, service_cities: true },
    });
    if (!planner) return null;
    const cities = Array.isArray(planner.service_cities)
      ? (planner.service_cities as unknown[]).filter(
          (c): c is string => typeof c === "string",
        )
      : [];
    return { country: planner.service_country, cities };
  }),

  // Replaces the planner's service area. City names are trimmed + lowercased
  // to match the substring match used by the `event_in_service_area`
  // fan-out. Duplicates are collapsed.
  updateServiceArea: protectedProcedure
    .input(
      z.object({
        country: z.string().min(2).max(8),
        cities: z.array(z.string().min(1).max(60)).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const normalized = Array.from(
        new Set(
          input.cities
            .map((c) => c.trim().toLowerCase())
            .filter((c) => c.length > 0),
        ),
      );
      return prisma.plannerProfile.update({
        where: { id: planner.id },
        data: {
          service_country: input.country.trim().toUpperCase(),
          service_cities: normalized,
        },
        select: { service_country: true, service_cities: true },
      });
    }),

  // Aggregated counts for the dashboard hero.
  stats: protectedProcedure.query(async ({ ctx }) => {
    const planner = await requirePlanner(ctx.user.id);
    const [activeEngagements, pendingProposals, releasedCount] =
      await Promise.all([
        prisma.proposal.count({
          where: { planner_id: planner.id, status: "accepted" },
        }),
        prisma.proposal.count({
          where: { planner_id: planner.id, status: "pending" },
        }),
        prisma.proposal.count({
          where: { planner_id: planner.id, status: "released" },
        }),
      ]);
    const profile = await prisma.plannerProfile.findUnique({
      where: { id: planner.id },
      select: { avg_rating: true, review_count: true },
    });
    return {
      activeEngagements,
      pendingProposals,
      releasedCount,
      avgRating: profile?.avg_rating ?? 0,
      reviewCount: profile?.review_count ?? 0,
    };
  }),

  // Direct upload of a portfolio image. Mirrors `vendors.uploadImage`:
  // accepts a base64 data URL and pushes it to Cloudinary under the
  // planner's folder. Available before `PlannerProfile` exists so the
  // portfolio dialog can upload while the profile is still being filled in.
  uploadImage: protectedProcedure
    .input(
      z.object({
        dataUrl: z
          .string()
          .min(50)
          .startsWith("data:image/", "Must be an image data URL"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await cloudinary.uploader.upload(input.dataUrl, {
        folder: `zaffa-planners/${ctx.user.id}`,
        resource_type: "image",
        type: "upload",
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }),

  portfolio: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const planner = await requirePlanner(ctx.user.id);
      return prisma.portfolioItem.findMany({
        where: { planner_id: planner.id },
        orderBy: { created_at: "desc" },
      });
    }),

    create: protectedProcedure
      .input(
        z.object({
          image_url: z.string().url(),
          caption: z.string().max(500).nullish(),
          event_type: eventTypeSchema.nullish(),
          style_tags: z.array(z.string().min(1).max(40)).max(20).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const planner = await requirePlanner(ctx.user.id);
        const created = await prisma.portfolioItem.create({
          data: {
            planner_id: planner.id,
            image_url: input.image_url,
            caption: input.caption ?? null,
            event_type: input.event_type ?? null,
            style_tags: input.style_tags ?? [],
          },
        });
        await trackServer(ctx.user.id, ANALYTICS_EVENTS.PORTFOLIO_ADDED, {
          owner: "planner",
          item_id: created.id,
          planner_id: planner.id,
          event_type: input.event_type ?? null,
        });
        return created;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          caption: z.string().max(500).nullish(),
          event_type: eventTypeSchema.nullish(),
          style_tags: z.array(z.string().min(1).max(40)).max(20).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const planner = await requirePlanner(ctx.user.id);
        const item = await prisma.portfolioItem.findFirst({
          where: { id: input.id, planner_id: planner.id },
          select: { id: true },
        });
        if (!item) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Portfolio item not found",
          });
        }
        const { id, ...rest } = input;
        return prisma.portfolioItem.update({
          where: { id },
          data: {
            ...(rest.caption !== undefined ? { caption: rest.caption } : {}),
            ...(rest.event_type !== undefined
              ? { event_type: rest.event_type }
              : {}),
            ...(rest.style_tags !== undefined
              ? { style_tags: rest.style_tags }
              : {}),
          },
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const planner = await requirePlanner(ctx.user.id);
        const item = await prisma.portfolioItem.findFirst({
          where: { id: input.id, planner_id: planner.id },
          select: { id: true },
        });
        if (!item) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Portfolio item not found",
          });
        }
        return prisma.portfolioItem.delete({ where: { id: input.id } });
      }),
  }),
});
