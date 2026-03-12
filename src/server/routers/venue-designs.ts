import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

const FLOOR_TYPES = ["ceramic", "marble", "wood", "grass", "sand", "concrete", "custom"] as const;

export const venueDesignsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.venueDesign.findMany({
      where: { user_id: ctx.user.id },
      orderBy: { updated_at: "desc" },
      select: {
        id: true,
        name: true,
        venue_width: true,
        venue_length: true,
        venue_height: true,
        venue_floor_type: true,
        thumbnail: true,
        updated_at: true,
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return prisma.venueDesign.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
    }),

  save: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        venue_width: z.number().min(5).max(60),
        venue_length: z.number().min(5).max(60),
        venue_height: z.number().min(3).max(10),
        venue_floor_type: z.enum(FLOOR_TYPES).default("ceramic"),
        venue_floor_color: z.string().default("#E8DDD0"),
        venue_wall_color: z.string().default("#FAF0E6"),
        items: z.any(),
        thumbnail: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const data = {
        name: input.name,
        venue_width: input.venue_width,
        venue_length: input.venue_length,
        venue_height: input.venue_height,
        venue_floor_type: input.venue_floor_type,
        venue_floor_color: input.venue_floor_color,
        venue_wall_color: input.venue_wall_color,
        items: input.items,
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
});
