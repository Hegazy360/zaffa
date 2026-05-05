import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { cloudinary } from "@/lib/cloudinary";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

const refSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  source: z.enum(["inspiration", "upload", "pinterest"]),
  sourceId: z.string().optional(),
  sourceUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  attribution: z.string().optional(),
});

const referencesSchema = z.object({
  overall_vibe: z.array(refSchema).max(10).default([]),
  tables: z.array(refSchema).max(10).default([]),
  flowers: z.array(refSchema).max(10).default([]),
  lighting: z.array(refSchema).max(10).default([]),
  venue_decor: z.array(refSchema).max(10).default([]),
});

const paletteSchema = z.object({
  name: z.string().optional(),
  colors: z.array(z.string()).max(8).default([]),
});

const eventTypeSchema = z.enum([
  "wedding",
  "engagement",
  "birthday",
  "corporate",
  "other",
]);
const settingSchema = z.enum(["indoor", "outdoor", "tent"]);
const sizeSchema = z.enum(["intimate", "medium", "large"]);
// Mirrors GUEST_COUNT_MIN / GUEST_COUNT_MAX in the client types — kept as a
// literal so we don't pull a client module into the server bundle.
const guestCountSchema = z.number().int().min(2).max(10000);

// Server-side mirror of `sizeFromGuestCount` (kept duplicated rather than
// imported because the client module references React/Zod-free constants
// only). If the buckets ever shift, update both call sites.
function deriveSize(count: number | null | undefined): "intimate" | "medium" | "large" {
  if (count == null) return "medium";
  if (count <= 50) return "intimate";
  if (count <= 150) return "medium";
  return "large";
}

export const venueDesignsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.venueDesign.findMany({
      where: { user_id: ctx.user.id },
      orderBy: { updated_at: "desc" },
      select: {
        id: true,
        name: true,
        event_type: true,
        setting: true,
        size: true,
        guest_count: true,
        palette: true,
        thumbnail: true,
        updated_at: true,
        event_id: true,
        approved_at: true,
        _count: { select: { media: true } },
        // Latest generated render for this design — used as the card hero
        // thumbnail. We filter to "render" because videos can't be cheaply
        // poster-extracted on the server.
        media: {
          where: { type: "render" },
          orderBy: { created_at: "desc" },
          take: 1,
          select: { url: true },
        },
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return prisma.venueDesign.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
        include: { media: { orderBy: { created_at: "desc" } } },
      });
    }),

  save: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        event_type: eventTypeSchema.default("wedding"),
        setting: settingSchema.default("indoor"),
        // `size` stays accepted for callers that don't yet send guest_count
        // (and as a fallback for the AI scene generator), but when a count
        // is provided it overrides the bucket.
        size: sizeSchema.default("medium"),
        guest_count: guestCountSchema.nullish(),
        palette: paletteSchema.default({ colors: [] }),
        references: referencesSchema.default({
          overall_vibe: [],
          tables: [],
          flowers: [],
          lighting: [],
          venue_decor: [],
        }),
        style_notes: z.string().max(2000).nullish(),
        thumbnail: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const guestCount = input.guest_count ?? null;
      const derivedSize = guestCount != null ? deriveSize(guestCount) : input.size;
      const data = {
        name: input.name,
        event_type: input.event_type,
        setting: input.setting,
        size: derivedSize,
        guest_count: guestCount,
        palette: input.palette,
        references: input.references,
        style_notes: input.style_notes ?? null,
        thumbnail: input.thumbnail,
      };

      if (input.id) {
        return prisma.venueDesign.update({
          where: { id: input.id, user_id: ctx.user.id },
          data,
        });
      }

      const created = await prisma.venueDesign.create({
        data: { ...data, user_id: ctx.user.id },
      });
      // Couple-journey funnel — top of the design step. We only fire on
      // first save (no `id` in input) so re-saves don't re-count.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_CREATED, {
        design_id: created.id,
        event_type: created.event_type,
        setting: created.setting,
        size: created.size,
        guest_count: created.guest_count,
      });
      return created;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.venueDesign.delete({
        where: { id: input.id, user_id: ctx.user.id },
      });
    }),

  saveMedia: protectedProcedure
    .input(
      z.object({
        design_id: z.string().uuid(),
        type: z.enum(["render", "video"]),
        url: z.string().min(1),
        // Optional: id of the source render this video was generated from.
        // Lets us scope videos to a specific render when displaying.
        parent_id: z.string().uuid().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const design = await prisma.venueDesign.findFirst({
        where: { id: input.design_id, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!design) throw new Error("Design not found");

      return prisma.venueDesignMedia.create({
        data: {
          design_id: input.design_id,
          type: input.type,
          url: input.url,
          parent_id: input.parent_id ?? null,
        },
      });
    }),

  deleteMedia: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const media = await prisma.venueDesignMedia.findFirst({
        where: { id: input.id },
        include: { design: { select: { user_id: true } } },
      });
      if (!media || media.design.user_id !== ctx.user.id) {
        throw new Error("Media not found");
      }
      return prisma.venueDesignMedia.delete({ where: { id: input.id } });
    }),

  uploadReference: protectedProcedure
    .input(
      z.object({
        dataUrl: z.string().min(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await cloudinary.uploader.upload(input.dataUrl, {
        folder: `zaffa-references/${ctx.user.id}`,
        resource_type: "image",
        type: "upload",
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }),

  rehostUrl: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await cloudinary.uploader.upload(input.url, {
        folder: `zaffa-references/${ctx.user.id}`,
        resource_type: "image",
        type: "upload",
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }),
});
