import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { Prisma, ProspectSource, ProspectStatus, ProspectType, VendorCategory } from "@/generated/prisma/client";

async function assertAdmin(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
}

const PROSPECT_SOURCE_VALUES = Object.values(ProspectSource) as [ProspectSource, ...ProspectSource[]];
const PROSPECT_TYPE_VALUES = Object.values(ProspectType) as [ProspectType, ...ProspectType[]];
const PROSPECT_STATUS_VALUES = Object.values(ProspectStatus) as [ProspectStatus, ...ProspectStatus[]];
const VENDOR_CATEGORY_VALUES = Object.values(VendorCategory) as [VendorCategory, ...VendorCategory[]];

export const prospectsRouter = router({
  // Filterable list. Returns lightweight rows for the table.
  list: protectedProcedure
    .input(
      z
        .object({
          q: z.string().max(200).optional(),
          source: z.enum(PROSPECT_SOURCE_VALUES).optional(),
          type: z.enum(PROSPECT_TYPE_VALUES).optional(),
          status: z.enum(PROSPECT_STATUS_VALUES).optional(),
          category: z.enum(VENDOR_CATEGORY_VALUES).optional(),
          limit: z.number().int().min(1).max(200).default(50),
          cursor: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const limit = input?.limit ?? 50;
      const where: Prisma.ProspectWhereInput = {
        ...(input?.source ? { source: input.source } : {}),
        ...(input?.type ? { prospect_type: input.type } : {}),
        ...(input?.status ? { status: input.status } : {}),
        ...(input?.category ? { vendor_category: input.category } : {}),
        ...(input?.q
          ? {
              OR: [
                { display_name: { contains: input.q, mode: "insensitive" } },
                { handle: { contains: input.q, mode: "insensitive" } },
                { email: { contains: input.q, mode: "insensitive" } },
                { instagram: { contains: input.q, mode: "insensitive" } },
                { facebook: { contains: input.q, mode: "insensitive" } },
                { tiktok: { contains: input.q, mode: "insensitive" } },
                { city: { contains: input.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const rows = await prisma.prospect.findMany({
        where,
        orderBy: [{ qualifying_score: "desc" }, { created_at: "desc" }],
        take: limit + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          source: true,
          source_url: true,
          display_name: true,
          handle: true,
          prospect_type: true,
          vendor_category: true,
          email: true,
          whatsapp: true,
          instagram: true,
          // Surfaced so the list-row "Quick Send" button knows whether it
          // needs to (re)generate a draft before opening WhatsApp Web.
          draft_whatsapp: true,
          city: true,
          country: true,
          followers: true,
          avatar_url: true,
          status: true,
          qualifying_score: true,
          contacted_at: true,
          contacted_via: true,
          replied_at: true,
          signed_up_user_id: true,
          created_at: true,
          last_seen_at: true,
        },
      });

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;
      return { items, nextCursor };
    }),

  // Bucketed counts for the kanban + dashboard widgets.
  funnel: protectedProcedure.query(async ({ ctx }) => {
    await assertAdmin(ctx.user.id);
    const grouped = await prisma.prospect.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const out: Record<ProspectStatus, number> = {
      [ProspectStatus.new]: 0,
      [ProspectStatus.qualified]: 0,
      [ProspectStatus.drafted]: 0,
      [ProspectStatus.contacted]: 0,
      [ProspectStatus.replied]: 0,
      [ProspectStatus.signed_up]: 0,
      [ProspectStatus.rejected]: 0,
    };
    for (const r of grouped) out[r.status] = r._count._all;
    return out;
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const row = await prisma.prospect.findUnique({
        where: { id: input.id },
        include: { discovery_run: true },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  // Manual entry of a single prospect. The (source, source_id) unique guards
  // duplicates from re-entering the same lead twice; for manual entries we
  // synthesize a source_id from a hash of the contact info.
  addManual: protectedProcedure
    .input(
      z.object({
        display_name: z.string().min(1).max(200),
        handle: z.string().max(200).nullish(),
        prospect_type: z.enum(PROSPECT_TYPE_VALUES).default(ProspectType.unknown),
        vendor_category: z.enum(VENDOR_CATEGORY_VALUES).nullish(),
        email: z.string().email().nullish(),
        whatsapp: z.string().max(40).nullish(),
        phone: z.string().max(40).nullish(),
        instagram: z.string().max(200).nullish(),
        facebook: z.string().max(500).nullish(),
        tiktok: z.string().max(200).nullish(),
        website: z.string().url().nullish(),
        bio: z.string().max(2000).nullish(),
        city: z.string().max(120).nullish(),
        country: z.string().max(8).default("EG"),
        followers: z.number().int().min(0).max(100_000_000).nullish(),
        avatar_url: z.string().url().nullish(),
        notes: z.string().max(5000).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const sourceIdSeed = [
        input.handle,
        input.email,
        input.whatsapp,
        input.instagram,
        input.facebook,
        input.tiktok,
        input.display_name,
      ]
        .filter(Boolean)
        .join("|");
      const source_id = `manual:${sourceIdSeed}`.slice(0, 200);
      try {
        const created = await prisma.prospect.create({
          data: {
            source: ProspectSource.manual,
            source_id,
            display_name: input.display_name,
            handle: input.handle ?? null,
            prospect_type: input.prospect_type,
            vendor_category: input.vendor_category ?? null,
            email: input.email ?? null,
            whatsapp: input.whatsapp ?? null,
            phone: input.phone ?? null,
            instagram: input.instagram ?? null,
            facebook: input.facebook ?? null,
            tiktok: input.tiktok ?? null,
            website: input.website ?? null,
            bio: input.bio ?? null,
            city: input.city ?? null,
            country: input.country,
            followers: input.followers ?? null,
            avatar_url: input.avatar_url ?? null,
            notes: input.notes ?? null,
            status: ProspectStatus.new,
          },
        });
        return created;
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A prospect with that contact already exists",
          });
        }
        throw e;
      }
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(PROSPECT_STATUS_VALUES),
        contacted_via: z
          .enum(["email", "whatsapp", "instagram", "facebook", "phone", "other"])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const data: Prisma.ProspectUpdateInput = { status: input.status };
      if (input.status === ProspectStatus.contacted) {
        data.contacted_at = new Date();
        if (input.contacted_via) data.contacted_via = input.contacted_via;
      }
      if (input.status === ProspectStatus.replied) {
        data.replied_at = new Date();
      }
      return prisma.prospect.update({ where: { id: input.id }, data });
    }),

  setNotes: protectedProcedure
    .input(z.object({ id: z.string().uuid(), notes: z.string().max(5000) }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.prospect.update({
        where: { id: input.id },
        data: { notes: input.notes },
      });
    }),

  // Manual link from a prospect row to an existing user (rare — usually the
  // signup matcher does this for us).
  match: protectedProcedure
    .input(z.object({ id: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const user = await prisma.profile.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return prisma.prospect.update({
        where: { id: input.id },
        data: {
          status: ProspectStatus.signed_up,
          signed_up_user_id: input.userId,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      await prisma.prospect.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
