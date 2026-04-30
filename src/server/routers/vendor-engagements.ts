import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

// One row per requested catalog item or one-off custom line. Quantity can be
// 0 for "ask the vendor" placeholders but we ignore those in the total.
const itemInputSchema = z.object({
  service_id: z.string().uuid().nullish(),
  name: z.string().min(1).max(160),
  description: z.string().max(1000).nullish(),
  quantity: z.number().int().min(1).max(1000).default(1),
  unit_price: z.number().min(0).max(10_000_000),
});

async function requirePlanner(userId: string) {
  const planner = await prisma.plannerProfile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!planner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Planner profile required",
    });
  }
  return planner;
}

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

// Recomputes the engagement's stored total from its current line items. We
// store the rolled-up number so list/card UIs don't have to sum on every
// render and so the planner balance check has a single source of truth.
async function recomputeTotal(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  engagementId: string,
) {
  const items = await tx.vendorEngagementItem.findMany({
    where: { engagement_id: engagementId },
    select: { line_total: true },
  });
  const total = items.reduce((s, i) => s + Number(i.line_total ?? 0), 0);
  await tx.vendorEngagement.update({
    where: { id: engagementId },
    data: { total_amount: total },
  });
  return total;
}

export const vendorEngagementsRouter = router({
  // List of engagements for one event. Used on the planner event Vendors tab
  // and (filtered to active/completed) anywhere else we want to show what
  // vendors are involved in the event.
  forEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ input }) => {
      return prisma.vendorEngagement.findMany({
        where: { event_id: input.eventId },
        orderBy: { created_at: "desc" },
        include: {
          vendor: {
            select: {
              id: true,
              business_name: true,
              category: true,
              avg_rating: true,
              review_count: true,
              profile: { select: { full_name: true, avatar_url: true } },
            },
          },
          items: { orderBy: { created_at: "asc" } },
          releases: { orderBy: { requested_at: "desc" } },
        },
      });
    }),

  // Single engagement with everything an UI surface needs (line items,
  // releases, vendor + planner profiles). Used by the planner detail page,
  // the vendor inbox detail, and the review form.
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const engagement = await prisma.vendorEngagement.findUnique({
        where: { id: input.id },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              event_type: true,
              event_date: true,
              client: { select: { full_name: true, avatar_url: true } },
            },
          },
          planner: {
            select: {
              id: true,
              business_name: true,
              avg_rating: true,
              review_count: true,
              profile: { select: { full_name: true, avatar_url: true } },
            },
          },
          vendor: {
            select: {
              id: true,
              business_name: true,
              category: true,
              avg_rating: true,
              review_count: true,
              profile: { select: { full_name: true, avatar_url: true } },
            },
          },
          items: { orderBy: { created_at: "asc" } },
          releases: { orderBy: { requested_at: "desc" } },
          reviews: {
            include: {
              author: { select: { full_name: true, avatar_url: true } },
            },
          },
        },
      });
      if (!engagement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Engagement not found",
        });
      }
      // Authorisation: only the engaging planner or the receiving vendor
      // can read the engagement. We don't expose it to the client at all
      // (clients never see vendors in v1).
      const [planner, vendor] = await Promise.all([
        prisma.plannerProfile.findUnique({
          where: { user_id: ctx.user.id },
          select: { id: true },
        }),
        prisma.vendorProfile.findUnique({
          where: { user_id: ctx.user.id },
          select: { id: true },
        }),
      ]);
      const isPlanner = planner?.id === engagement.planner_id;
      const isVendor = vendor?.id === engagement.vendor_id;
      if (!isPlanner && !isVendor) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return engagement;
    }),

  // Vendor inbox feed. Surfaces every engagement currently waiting on the
  // vendor (status=requested) plus a tail of recently accepted ones so they
  // can review the line items at a glance. Returns [] pre-onboarding so the
  // inbox renders an empty state instead of a 403 toast.
  incoming: protectedProcedure.query(async ({ ctx }) => {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { user_id: ctx.user.id },
      select: { id: true },
    });
    if (!vendor) return [];
    return prisma.vendorEngagement.findMany({
      where: { vendor_id: vendor.id },
      orderBy: [{ status: "asc" }, { requested_at: "desc" }],
      include: {
        event: { select: { id: true, title: true, event_date: true } },
        planner: {
          select: {
            id: true,
            business_name: true,
            profile: { select: { full_name: true, avatar_url: true } },
          },
        },
        items: { orderBy: { created_at: "asc" } },
      },
    });
  }),

  // Planner-wide engagement list (across all their events). Used by the
  // future "Vendors" tab on the planner sidebar / overview.
  mineForPlanner: protectedProcedure.query(async ({ ctx }) => {
    const planner = await prisma.plannerProfile.findUnique({
      where: { user_id: ctx.user.id },
      select: { id: true },
    });
    if (!planner) return [];
    return prisma.vendorEngagement.findMany({
      where: { planner_id: planner.id },
      orderBy: { created_at: "desc" },
      include: {
        event: { select: { id: true, title: true, event_date: true } },
        vendor: {
          select: {
            id: true,
            business_name: true,
            category: true,
            avg_rating: true,
            profile: { select: { full_name: true, avatar_url: true } },
          },
        },
        items: { orderBy: { created_at: "asc" } },
        releases: { orderBy: { requested_at: "desc" } },
      },
    });
  }),

  // Planner creates a new engagement request from the vendor profile cart.
  // We snapshot prices on the line items so post-creation catalog edits
  // don't retroactively change the deal.
  request: protectedProcedure
    .input(
      z.object({
        event_id: z.string().uuid(),
        vendor_id: z.string().uuid(),
        title: z.string().min(1).max(160),
        notes: z.string().max(2000).nullish(),
        currency: z.string().min(2).max(8).default("EGP"),
        items: z.array(itemInputSchema).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      // Ensure the planner owns the event (or is the assigned planner).
      const event = await prisma.event.findFirst({
        where: {
          id: input.event_id,
          OR: [
            { planner_id: planner.id },
            { proposals: { some: { planner_id: planner.id, status: "accepted" } } },
          ],
        },
        select: { id: true },
      });
      if (!event) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only request vendors for events you're working on",
        });
      }
      const vendor = await prisma.vendorProfile.findUnique({
        where: { id: input.vendor_id },
        select: { id: true },
      });
      if (!vendor) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
      }
      const total = input.items.reduce(
        (s, i) => s + i.unit_price * i.quantity,
        0,
      );
      return prisma.$transaction(async (tx) => {
        const engagement = await tx.vendorEngagement.create({
          data: {
            event_id: input.event_id,
            planner_id: planner.id,
            vendor_id: input.vendor_id,
            title: input.title,
            notes: input.notes ?? null,
            status: "requested",
            currency: input.currency,
            total_amount: total,
            requested_at: new Date(),
            items: {
              create: input.items.map((i) => ({
                service_id: i.service_id ?? null,
                name: i.name,
                description: i.description ?? null,
                quantity: i.quantity,
                unit_price: i.unit_price,
                line_total: i.unit_price * i.quantity,
              })),
            },
          },
          include: { items: true },
        });
        return engagement;
      });
    }),

  // Vendor accepts or declines a pending request. Counter-offers are out of
  // scope for v1 — the planner has to cancel + re-request to revise terms.
  vendorRespond: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        accept: z.boolean(),
        message: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const vendor = await requireVendor(ctx.user.id);
      const engagement = await prisma.vendorEngagement.findUnique({
        where: { id: input.id },
        select: { id: true, vendor_id: true, status: true },
      });
      if (!engagement || engagement.vendor_id !== vendor.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Engagement not found",
        });
      }
      if (engagement.status !== "requested") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Engagement is no longer awaiting a response",
        });
      }
      const nextStatus = input.accept ? "accepted" : "declined";
      return prisma.vendorEngagement.update({
        where: { id: engagement.id },
        data: {
          status: nextStatus,
          ...(input.accept ? { accepted_at: new Date() } : {}),
          ...(input.message
            ? { notes: input.message }
            : {}),
        },
      });
    }),

  // Planner marks the engagement complete after final delivery. Required
  // before the planner can leave a review.
  complete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const engagement = await prisma.vendorEngagement.findUnique({
        where: { id: input.id },
        select: { id: true, planner_id: true, status: true },
      });
      if (!engagement || engagement.planner_id !== planner.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Engagement not found",
        });
      }
      if (!["accepted", "active"].includes(engagement.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only accepted or active engagements can be completed",
        });
      }
      return prisma.vendorEngagement.update({
        where: { id: engagement.id },
        data: { status: "completed", completed_at: new Date() },
      });
    }),

  // Either side can cancel before completion. If there are pending releases
  // we refuse — the planner has to cancel those first so we don't strand
  // money in limbo.
  cancel: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [planner, vendor] = await Promise.all([
        prisma.plannerProfile.findUnique({
          where: { user_id: ctx.user.id },
          select: { id: true },
        }),
        prisma.vendorProfile.findUnique({
          where: { user_id: ctx.user.id },
          select: { id: true },
        }),
      ]);
      const engagement = await prisma.vendorEngagement.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          planner_id: true,
          vendor_id: true,
          status: true,
          notes: true,
        },
      });
      if (!engagement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Engagement not found",
        });
      }
      const isPlanner = planner?.id === engagement.planner_id;
      const isVendor = vendor?.id === engagement.vendor_id;
      if (!isPlanner && !isVendor) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (["completed", "cancelled", "declined"].includes(engagement.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Engagement is already closed",
        });
      }
      const pendingReleases = await prisma.vendorRelease.count({
        where: { engagement_id: engagement.id, status: "pending" },
      });
      if (pendingReleases > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cancel pending releases before cancelling the engagement",
        });
      }
      const nextNotes = input.reason
        ? [engagement.notes, `Cancelled: ${input.reason}`]
            .filter(Boolean)
            .join("\n\n")
        : engagement.notes;
      return prisma.vendorEngagement.update({
        where: { id: engagement.id },
        data: {
          status: "cancelled",
          cancelled_at: new Date(),
          notes: nextNotes,
        },
      });
    }),

  // Vendor toggles a line item as delivered. We store the timestamp so the
  // engagement detail page can show a clean "what's outstanding" view.
  markItemDelivered: protectedProcedure
    .input(
      z.object({
        engagement_id: z.string().uuid(),
        item_id: z.string().uuid(),
        delivered: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const vendor = await requireVendor(ctx.user.id);
      const engagement = await prisma.vendorEngagement.findUnique({
        where: { id: input.engagement_id },
        select: { id: true, vendor_id: true, status: true },
      });
      if (!engagement || engagement.vendor_id !== vendor.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Engagement not found",
        });
      }
      if (!["accepted", "active", "completed"].includes(engagement.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Engagement is not active",
        });
      }
      return prisma.vendorEngagementItem.update({
        where: { id: input.item_id },
        data: { delivered_at: input.delivered ? new Date() : null },
      });
    }),

  // Planner edits the line items on an existing engagement before the
  // vendor accepts. Useful for fixing typos / quantities without forcing a
  // cancel-and-recreate.
  updateItems: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        items: z.array(itemInputSchema).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const planner = await requirePlanner(ctx.user.id);
      const engagement = await prisma.vendorEngagement.findUnique({
        where: { id: input.id },
        select: { id: true, planner_id: true, status: true },
      });
      if (!engagement || engagement.planner_id !== planner.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Engagement not found",
        });
      }
      if (engagement.status !== "requested") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Items can only be edited while the request is pending",
        });
      }
      return prisma.$transaction(async (tx) => {
        await tx.vendorEngagementItem.deleteMany({
          where: { engagement_id: engagement.id },
        });
        await tx.vendorEngagementItem.createMany({
          data: input.items.map((i) => ({
            engagement_id: engagement.id,
            service_id: i.service_id ?? null,
            name: i.name,
            description: i.description ?? null,
            quantity: i.quantity,
            unit_price: i.unit_price,
            line_total: i.unit_price * i.quantity,
          })),
        });
        await recomputeTotal(tx, engagement.id);
        return tx.vendorEngagement.findUnique({
          where: { id: engagement.id },
          include: { items: true },
        });
      });
    }),
});
