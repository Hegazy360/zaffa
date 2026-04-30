import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { cloudinary } from "@/lib/cloudinary";

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
        thumbnail: true,
        updated_at: true,
        _count: { select: { media: true } },
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
        size: sizeSchema.default("medium"),
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
      const data = {
        name: input.name,
        event_type: input.event_type,
        setting: input.setting,
        size: input.size,
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

      return prisma.venueDesign.create({
        data: { ...data, user_id: ctx.user.id },
      });
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
