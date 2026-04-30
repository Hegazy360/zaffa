import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

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
  // Public-facing planner profile by id. Used on `/planners/[id]` so couples
  // (and signed-out visitors) can review the planner's portfolio + reviews
  // before deciding to engage. Filters out anything we wouldn't want public
  // (e.g. user_id is exposed but not the email).
  byId: publicProcedure
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
        return prisma.portfolioItem.create({
          data: {
            planner_id: planner.id,
            image_url: input.image_url,
            caption: input.caption ?? null,
            event_type: input.event_type ?? null,
            style_tags: input.style_tags ?? [],
          },
        });
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
