import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const inspirationRouter = router({
  byCategory: publicProcedure
    .input(
      z.object({
        category: z.enum([
          "overall_vibe",
          "flowers",
          "tables",
          "lighting",
          "venue_decor",
        ]),
        subcategory: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return prisma.inspirationImage.findMany({
        where: {
          category: input.category,
          ...(input.subcategory ? { subcategory: input.subcategory } : {}),
        },
        orderBy: { created_at: "desc" },
      });
    }),

  subcategories: publicProcedure
    .input(
      z.object({
        category: z.enum([
          "overall_vibe",
          "flowers",
          "tables",
          "lighting",
          "venue_decor",
        ]),
      })
    )
    .query(async ({ input }) => {
      const rows = await prisma.inspirationImage.findMany({
        where: { category: input.category },
        select: { subcategory: true },
        distinct: ["subcategory"],
        orderBy: { subcategory: "asc" },
      });
      return rows.map((r) => r.subcategory);
    }),
});
