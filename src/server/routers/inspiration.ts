import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import {
  PinterestSearchError,
  searchPinterest,
} from "../inspiration/pinterest";

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

  searchPinterest: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(120),
        pageSize: z.number().int().min(1).max(50).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        return await searchPinterest(input);
      } catch (err) {
        if (err instanceof PinterestSearchError) {
          throw new TRPCError({
            code: err.cause?.status === 401 ? "UNAUTHORIZED" : "BAD_GATEWAY",
            message: err.message,
          });
        }
        throw err;
      }
    }),
});
