import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import {
  ProspectStatus,
  ProspectType,
  VendorCategory,
} from "@/generated/prisma/client";
import { draftMessage } from "@/server/services/prospects/llm";

async function assertAdmin(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
}

const CHANNELS = ["email", "whatsapp", "instagram"] as const;
const PROSPECT_TYPE_VALUES = Object.values(ProspectType) as [
  ProspectType,
  ...ProspectType[],
];
const VENDOR_CATEGORY_VALUES = Object.values(VendorCategory) as [
  VendorCategory,
  ...VendorCategory[],
];

export const outreachRouter = router({
  // -------- Templates --------
  templatesList: protectedProcedure
    .input(
      z
        .object({
          channel: z.enum(CHANNELS).optional(),
          activeOnly: z.boolean().default(false),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.outreachTemplate.findMany({
        where: {
          ...(input?.channel ? { channel: input.channel } : {}),
          ...(input?.activeOnly ? { active: true } : {}),
        },
        orderBy: [{ active: "desc" }, { updated_at: "desc" }],
      });
    }),

  templateUpsert: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        channel: z.enum(CHANNELS),
        type: z.enum(PROSPECT_TYPE_VALUES),
        category: z.enum(VENDOR_CATEGORY_VALUES).nullish(),
        subject: z.string().max(200).nullish(),
        body: z.string().min(1).max(5000),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const data = {
        name: input.name,
        channel: input.channel,
        type: input.type,
        category: input.category ?? null,
        subject: input.subject ?? null,
        body: input.body,
        active: input.active,
      };
      if (input.id) {
        return prisma.outreachTemplate.update({ where: { id: input.id }, data });
      }
      return prisma.outreachTemplate.create({ data });
    }),

  templateDelete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      await prisma.outreachTemplate.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  // -------- Drafts --------
  // Generate a per-channel draft for a prospect, cache it on the row, and
  // return the rendered text. We pick the most relevant active template
  // (channel + type, optionally matching the vendor category).
  draft: protectedProcedure
    .input(
      z.object({
        prospectId: z.string().uuid(),
        channel: z.enum(CHANNELS),
        // Optional override of which template to use.
        templateId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const prospect = await prisma.prospect.findUnique({
        where: { id: input.prospectId },
      });
      if (!prospect) throw new TRPCError({ code: "NOT_FOUND" });

      const template = await pickTemplate({
        templateId: input.templateId,
        channel: input.channel,
        type: prospect.prospect_type,
        category: prospect.vendor_category,
      });
      if (!template) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No active ${input.channel} template found for ${prospect.prospect_type}`,
        });
      }

      const drafted = await draftMessage({
        channel: input.channel,
        template: { subject: template.subject, body: template.body },
        prospect: {
          display_name: prospect.display_name,
          handle: prospect.handle,
          prospect_type: prospect.prospect_type,
          vendor_category: prospect.vendor_category,
          city: prospect.city,
          bio: prospect.bio,
        },
      });

      const text =
        input.channel === "email" && drafted.subject
          ? `Subject: ${drafted.subject}\n\n${drafted.body}`
          : drafted.body;

      // Cache the rendered text on the prospect row + flip status to drafted
      // (only if it was less progressed than that).
      const draftField =
        input.channel === "email"
          ? "draft_email"
          : input.channel === "whatsapp"
            ? "draft_whatsapp"
            : "draft_instagram";
      const upgradeStatus =
        prospect.status === ProspectStatus.new ||
        prospect.status === ProspectStatus.qualified;
      await prisma.prospect.update({
        where: { id: prospect.id },
        data: {
          [draftField]: text,
          ...(upgradeStatus ? { status: ProspectStatus.drafted } : {}),
        },
      });
      return { channel: input.channel, subject: drafted.subject, body: drafted.body, text };
    }),

  // Mark contacted via a specific channel. Stamps `contacted_at` and
  // `contacted_via` and flips status to contacted.
  markContacted: protectedProcedure
    .input(
      z.object({
        prospectId: z.string().uuid(),
        channel: z.enum(["email", "whatsapp", "instagram", "facebook", "phone", "other"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.prospect.update({
        where: { id: input.prospectId },
        data: {
          status: ProspectStatus.contacted,
          contacted_at: new Date(),
          contacted_via: input.channel,
        },
      });
    }),
});

async function pickTemplate(args: {
  templateId?: string;
  channel: (typeof CHANNELS)[number];
  type: ProspectType;
  category: VendorCategory | null;
}) {
  if (args.templateId) {
    return prisma.outreachTemplate.findUnique({ where: { id: args.templateId } });
  }
  // Prefer category-specific match, then by type, then any active template.
  const orderBy = { updated_at: "desc" as const };
  if (args.category) {
    const t = await prisma.outreachTemplate.findFirst({
      where: {
        channel: args.channel,
        type: args.type,
        category: args.category,
        active: true,
      },
      orderBy,
    });
    if (t) return t;
  }
  const t = await prisma.outreachTemplate.findFirst({
    where: { channel: args.channel, type: args.type, active: true },
    orderBy,
  });
  if (t) return t;
  return prisma.outreachTemplate.findFirst({
    where: { channel: args.channel, active: true },
    orderBy,
  });
}
