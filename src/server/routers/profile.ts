import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n/config";
import { ProspectStatus } from "@/generated/prisma/client";

const localeSchema = z.enum(locales);

// Best-effort link from any Prospect rows matching the new user to their
// freshly-created Profile. Runs on first sign-in. Idempotent: rows already
// linked to another user are left alone, and we only update prospects whose
// `signed_up_user_id` is still null.
async function linkProspectsByEmail(userId: string, email: string | null) {
  if (!email) return;
  const normalized = email.trim().toLowerCase();
  await prisma.prospect.updateMany({
    where: { email: { equals: normalized, mode: "insensitive" }, signed_up_user_id: null },
    data: { status: ProspectStatus.signed_up, signed_up_user_id: userId },
  });
}

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
        locale: true,
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

  // Persist the user's locale choice. The locale switcher writes the cookie
  // first for an instant UX, then fires this mutation so the choice follows
  // the user across browsers / devices.
  setLocale: protectedProcedure
    .input(z.object({ locale: localeSchema }))
    .mutation(async ({ ctx, input }) => {
      await prisma.profile.update({
        where: { id: ctx.user.id },
        data: { locale: input.locale },
        select: { id: true },
      });
      return { ok: true };
    }),

  // Called once right after signup succeeds. Walks the prospect funnel and
  // marks any matching rows as `signed_up`, linking them to this user. Safe
  // to call repeatedly (it's an updateMany with a `signed_up_user_id IS NULL`
  // guard).
  claimProspect: protectedProcedure.mutation(async ({ ctx }) => {
    await linkProspectsByEmail(ctx.user.id, ctx.user.email ?? null);
    return { ok: true };
  }),
});
