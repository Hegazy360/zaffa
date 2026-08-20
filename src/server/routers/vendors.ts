import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { cloudinary } from "@/lib/cloudinary";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

const vendorCategorySchema = z.enum([
  "catering",
  "photography",
  "videography",
  "flowers",
  "music",
  "decoration",
  "venue",
  "makeup",
  "fashion",
  "transportation",
  "other",
]);

const eventTypeSchema = z.enum([
  "wedding",
  "engagement",
  "birthday",
  "corporate",
  "other",
]);

async function requireVendor(userId: string) {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!vendor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vendor profile required",
    });
  }
  return vendor;
}

export const vendorsRouter = router({
  // The vendor's own profile (read by their dashboard). Returns null if the
  // user hasn't completed vendor signup yet so the layout can route them to
  // the setup flow.
  me: protectedProcedure.query(async ({ ctx }) => {
    return prisma.vendorProfile.findUnique({
      where: { user_id: ctx.user.id },
      include: {
        profile: { select: { full_name: true, avatar_url: true } },
        portfolio_items: { orderBy: { created_at: "desc" } },
      },
    });
  }),

  // Vendor profile by id, used by the planner-side browse + detail pages
  // and also the planner-event vendor card. Includes catalog + reviews so
  // those pages can render in a single round-trip. Gated to authenticated
  // users only, public access to the vendor catalog is currently disabled
  // (see the `publicBrowse` flag in `src/lib/flags.ts`).
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const vendor = await prisma.vendorProfile.findUnique({
        where: { id: input.id },
        include: {
          profile: { select: { full_name: true, avatar_url: true } },
          services: {
            where: { available: true },
            orderBy: { created_at: "desc" },
          },
          portfolio_items: { orderBy: { created_at: "desc" }, take: 24 },
          reviews: {
            orderBy: { created_at: "desc" },
            take: 12,
            include: {
              author: { select: { full_name: true, avatar_url: true } },
            },
          },
        },
      });
      if (!vendor) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
      }
      return vendor;
    }),

  // Planner-side / public browse. Supports a category filter, location prefix
  // match, and a free-text query that runs against business_name + bio.
  // Authenticated only, the public `/vendors` page is currently dark-shipped
  // behind the `publicBrowse` flag, so we don't want this exposed unauthed
  // either.
  search: protectedProcedure
    .input(
      z.object({
        category: vendorCategorySchema.optional(),
        location: z.string().trim().max(120).optional(),
        query: z.string().trim().max(200).optional(),
        take: z.number().int().min(1).max(60).default(24),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {};
      if (input.category) where.category = input.category;
      if (input.location && input.location.length > 0) {
        where.location = { contains: input.location, mode: "insensitive" };
      }
      if (input.query && input.query.length > 0) {
        where.OR = [
          { business_name: { contains: input.query, mode: "insensitive" } },
          { bio: { contains: input.query, mode: "insensitive" } },
        ];
      }
      const items = await prisma.vendorProfile.findMany({
        where,
        orderBy: [{ avg_rating: "desc" }, { created_at: "desc" }],
        take: input.take + 1,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
        include: {
          profile: { select: { full_name: true, avatar_url: true } },
          services: {
            where: { available: true },
            orderBy: { price_from: "asc" },
            take: 3,
          },
          _count: { select: { reviews: true, services: true } },
        },
      });
      const hasMore = items.length > input.take;
      const trimmed = hasMore ? items.slice(0, -1) : items;

      // Planner-journey funnel, only fire on the first page of results
      // (no cursor) to avoid double-counting infinite-scroll pagination.
      // Captures the search shape so we can later see which filters are
      // actually used.
      if (!input.cursor) {
        await trackServer(ctx.user.id, ANALYTICS_EVENTS.VENDOR_SEARCHED, {
          category: input.category ?? null,
          location: input.location ?? null,
          has_query: Boolean(input.query && input.query.length > 0),
          result_count: trimmed.length,
        });
      }

      return {
        items: trimmed,
        nextCursor: hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null,
      };
    }),

  // Vendor-self update. Doubles as create-on-first-save: a freshly signed-up
  // vendor has a Profile but no VendorProfile row, so we upsert and flip the
  // role flag in the same transaction so role-based gating works immediately.
  update: protectedProcedure
    .input(
      z.object({
        business_name: z.string().min(1).max(120),
        category: vendorCategorySchema,
        bio: z.string().max(2000).nullish(),
        location: z.string().max(120).nullish(),
        specialties: z.array(z.string().min(1).max(40)).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.vendorProfile.findUnique({
        where: { user_id: ctx.user.id },
        select: { id: true },
      });
      if (!existing) {
        const created = await prisma.vendorProfile.create({
          data: {
            user_id: ctx.user.id,
            business_name: input.business_name,
            category: input.category,
            bio: input.bio ?? null,
            location: input.location ?? null,
            specialties: input.specialties ?? [],
          },
        });
        await prisma.profile.update({
          where: { id: ctx.user.id },
          data: { role: "vendor" },
        });
        await trackServer(ctx.user.id, ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
          role: "vendor",
        });
        await trackServer(ctx.user.id, ANALYTICS_EVENTS.PROFILE_PUBLISHED, {
          role: "vendor",
          vendor_id: created.id,
          category: input.category,
        });
        return created;
      }
      return prisma.vendorProfile.update({
        where: { user_id: ctx.user.id },
        data: {
          business_name: input.business_name,
          category: input.category,
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.specialties !== undefined
            ? { specialties: input.specialties }
            : {}),
        },
      });
    }),

  // Aggregated counts for the vendor dashboard hero. Earnings and pending
  // releases live in vendor-releases / payouts to avoid duplicating the
  // accounting logic, but the vendor still wants quick context here.
  // Returns zeros pre-onboarding so dashboard tiles don't 403 before the
  // vendor has saved a profile.
  stats: protectedProcedure.query(async ({ ctx }) => {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { user_id: ctx.user.id },
      select: { id: true },
    });
    if (!vendor) {
      return {
        incomingRequests: 0,
        activeEngagements: 0,
        completedEngagements: 0,
        pendingReleaseAmount: 0,
        pendingReleaseCount: 0,
        avgRating: 0,
        reviewCount: 0,
      };
    }
    const [requested, active, completed, pendingReleases, profile] =
      await Promise.all([
        prisma.vendorEngagement.count({
          where: { vendor_id: vendor.id, status: "requested" },
        }),
        prisma.vendorEngagement.count({
          where: { vendor_id: vendor.id, status: { in: ["accepted", "active"] } },
        }),
        prisma.vendorEngagement.count({
          where: { vendor_id: vendor.id, status: "completed" },
        }),
        prisma.vendorRelease.aggregate({
          where: { vendor_id: vendor.id, status: "pending" },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.vendorProfile.findUnique({
          where: { id: vendor.id },
          select: { avg_rating: true, review_count: true },
        }),
      ]);
    return {
      incomingRequests: requested,
      activeEngagements: active,
      completedEngagements: completed,
      pendingReleaseAmount: Number(pendingReleases._sum.amount ?? 0),
      pendingReleaseCount: pendingReleases._count._all,
      avgRating: profile?.avg_rating ?? 0,
      reviewCount: profile?.review_count ?? 0,
    };
  }),

  // Direct upload of a portfolio / catalog image. Accepts a base64 data URL
  // and pushes it to Cloudinary under the vendor's folder so we can find /
  // delete it later. Vendors can call this even before they've finalized
  // their VendorProfile so the profile page can upload assets while the form
  // is still being filled in.
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
        folder: `zaffa-vendors/${ctx.user.id}`,
        resource_type: "image",
        type: "upload",
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }),

  // Vendor-self catalog management. Each call validates ownership of the
  // VendorService row before mutating to stop one vendor editing another's
  // catalog through a forged id.
  services: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const vendor = await prisma.vendorProfile.findUnique({
        where: { user_id: ctx.user.id },
        select: { id: true },
      });
      if (!vendor) return [];
      return prisma.vendorService.findMany({
        where: { vendor_id: vendor.id },
        orderBy: [{ available: "desc" }, { created_at: "desc" }],
      });
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(160),
          description: z.string().max(2000).nullish(),
          price_from: z.number().min(0).max(10_000_000),
          price_unit: z.string().min(1).max(40).default("per_event"),
          subcategory: z.string().max(80).nullish(),
          images: z.array(z.string().url()).max(12).default([]),
          lead_time_days: z.number().int().min(0).max(365).nullish(),
          available: z.boolean().default(true),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const vendor = await requireVendor(ctx.user.id);
        const created = await prisma.vendorService.create({
          data: {
            vendor_id: vendor.id,
            name: input.name,
            description: input.description ?? null,
            price_from: input.price_from,
            price_unit: input.price_unit,
            subcategory: input.subcategory ?? null,
            images: input.images,
            lead_time_days: input.lead_time_days ?? null,
            available: input.available,
          },
        });
        // Vendor activation funnel, every new service is a step toward
        // a complete catalog. Captured against the vendor's distinctId.
        await trackServer(ctx.user.id, ANALYTICS_EVENTS.SERVICE_ADDED, {
          service_id: created.id,
          vendor_id: vendor.id,
          price_from: input.price_from,
          subcategory: input.subcategory ?? null,
        });
        return created;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().min(1).max(160).optional(),
          description: z.string().max(2000).nullish(),
          price_from: z.number().min(0).max(10_000_000).optional(),
          price_unit: z.string().min(1).max(40).optional(),
          subcategory: z.string().max(80).nullish(),
          images: z.array(z.string().url()).max(12).optional(),
          lead_time_days: z.number().int().min(0).max(365).nullish(),
          available: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const vendor = await requireVendor(ctx.user.id);
        const owned = await prisma.vendorService.findFirst({
          where: { id: input.id, vendor_id: vendor.id },
          select: { id: true },
        });
        if (!owned) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Service not found",
          });
        }
        const { id, ...rest } = input;
        return prisma.vendorService.update({
          where: { id },
          data: {
            ...(rest.name !== undefined ? { name: rest.name } : {}),
            ...(rest.description !== undefined
              ? { description: rest.description }
              : {}),
            ...(rest.price_from !== undefined
              ? { price_from: rest.price_from }
              : {}),
            ...(rest.price_unit !== undefined
              ? { price_unit: rest.price_unit }
              : {}),
            ...(rest.subcategory !== undefined
              ? { subcategory: rest.subcategory }
              : {}),
            ...(rest.images !== undefined ? { images: rest.images } : {}),
            ...(rest.lead_time_days !== undefined
              ? { lead_time_days: rest.lead_time_days }
              : {}),
            ...(rest.available !== undefined
              ? { available: rest.available }
              : {}),
          },
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const vendor = await requireVendor(ctx.user.id);
        const owned = await prisma.vendorService.findFirst({
          where: { id: input.id, vendor_id: vendor.id },
          select: { id: true },
        });
        if (!owned) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Service not found",
          });
        }
        return prisma.vendorService.delete({ where: { id: input.id } });
      }),
  }),

  // Portfolio CRUD mirrors planner.portfolio so the same UI patterns can be
  // reused with minimal friction.
  portfolio: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const vendor = await prisma.vendorProfile.findUnique({
        where: { user_id: ctx.user.id },
        select: { id: true },
      });
      if (!vendor) return [];
      return prisma.vendorPortfolioItem.findMany({
        where: { vendor_id: vendor.id },
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
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const vendor = await requireVendor(ctx.user.id);
        const created = await prisma.vendorPortfolioItem.create({
          data: {
            vendor_id: vendor.id,
            image_url: input.image_url,
            caption: input.caption ?? null,
            event_type: input.event_type ?? null,
            style_tags: input.style_tags ?? [],
          },
        });
        await trackServer(ctx.user.id, ANALYTICS_EVENTS.PORTFOLIO_ADDED, {
          owner: "vendor",
          item_id: created.id,
          vendor_id: vendor.id,
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
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const vendor = await requireVendor(ctx.user.id);
        const item = await prisma.vendorPortfolioItem.findFirst({
          where: { id: input.id, vendor_id: vendor.id },
          select: { id: true },
        });
        if (!item) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Portfolio item not found",
          });
        }
        const { id, ...rest } = input;
        return prisma.vendorPortfolioItem.update({
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
        const vendor = await requireVendor(ctx.user.id);
        const item = await prisma.vendorPortfolioItem.findFirst({
          where: { id: input.id, vendor_id: vendor.id },
          select: { id: true },
        });
        if (!item) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Portfolio item not found",
          });
        }
        return prisma.vendorPortfolioItem.delete({ where: { id: input.id } });
      }),
  }),
});
