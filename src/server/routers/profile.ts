import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const profileRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.profile.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        role: true,
        full_name: true,
        avatar_url: true,
        phone: true,
        created_at: true,
      },
    });
    if (!profile) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
    }
    return {
      ...profile,
      email: ctx.user.email ?? null,
    };
  }),

  update: protectedProcedure
    .input(
      z.object({
        full_name: z.string().min(1).max(200).optional(),
        avatar_url: z.string().url().nullish(),
        phone: z.string().max(50).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.profile.update({
        where: { id: ctx.user.id },
        data: input,
        select: {
          id: true,
          full_name: true,
          avatar_url: true,
          phone: true,
        },
      });
    }),
});
