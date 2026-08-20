import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, nonAnonymousProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { cloudinary, watermarkedUrl } from "@/lib/cloudinary";
import { isFreePack } from "@/lib/vision-pack";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { reportError } from "@/lib/logger";
import { isFlagEnabled } from "@/lib/flags";
import { notifyDesignApproved } from "@/server/services/notifications/dispatchers";

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
// Mirrors GUEST_COUNT_MIN / GUEST_COUNT_MAX in the client types, kept as a
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

/**
 * Resolve the user's most recent active/fulfilled pack so we know
 * whether to serve clean or watermarked URLs for their media. Cached
 * once per call (not memoized across requests, pack state mutates).
 */
async function loadActivePackForUser(userId: string) {
  return prisma.visionPack.findFirst({
    where: {
      recipient_user_id: userId,
      status: { in: ["active", "fulfilled"] },
    },
    orderBy: { paid_at: "desc" },
    select: { id: true, sku: true },
  });
}

/**
 * Pick the URL to serve for a given media row given the user's current
 * pack tier. Free tier sees the watermarked Cloudinary transformation;
 * paid tiers see the clean asset. Rows without a `cloudinary_public_id`
 * (legacy + provider-hosted) always serve the stored URL, we can't
 * derive a watermark without the public id.
 */
function urlForTier(
  row: { url: string; cloudinary_public_id: string | null; type: string },
  isFreeTier: boolean,
): string {
  if (!isFreeTier) return row.url;
  if (row.type !== "render") return row.url; // Videos aren't watermarked yet.
  if (!row.cloudinary_public_id) return row.url;
  return watermarkedUrl(row.cloudinary_public_id);
}

export const venueDesignsRouter = router({
  /**
   * "I want this wedding, contact me."
   *
   * Approval used to be `events.createFromDesign`, gated on the Vision Pack
   * SKU because it opened the planner marketplace. The marketplace is hidden
   * now, so that gate was selling a door that 404s - and it surfaced to real
   * clients as a raw `PACK_TIER_NO_PLANNER_MATCH` toast. Under the concierge
   * model, approving a design is a *lead*, not a feature unlock: it must be
   * free for anyone with a permanent account. Pack buyers who only want the
   * PDF simply never click it.
   *
   * `nonAnonymousProcedure` rather than `protectedProcedure` on purpose: an
   * approval without contact details is unactionable, and the email gate is
   * where anonymous visitors acquire one.
   *
   * Shape mirrors `enquiries.submit`: the Enquiry row is written FIRST and
   * every side effect after it (admin fan-out, analytics) is best-effort -
   * an email outage must never lose the warmest lead the funnel produces.
   */
  approve: nonAnonymousProcedure
    .input(z.object({ designId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Conditional write doubles as the idempotency guard: only the call
      // that flips `approved_at` from null proceeds to create the lead, so a
      // re-click (or a replayed request) can never spam every admin twice.
      const flipped = await prisma.venueDesign.updateMany({
        where: { id: input.designId, user_id: ctx.user.id, approved_at: null },
        data: { approved_at: new Date() },
      });

      if (flipped.count === 0) {
        const design = await prisma.venueDesign.findFirst({
          where: { id: input.designId, user_id: ctx.user.id },
          select: { id: true },
        });
        if (!design) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Design not found" });
        }
        // Already approved, hand back the existing lead so the UI can show
        // the same "we're on it" state without creating a duplicate.
        const existing = await prisma.enquiry.findFirst({
          where: { design_id: input.designId, source: "design_approved" },
          orderBy: { created_at: "desc" },
          select: { id: true },
        });
        return {
          ok: true as const,
          alreadyApproved: true as const,
          enquiryId: existing?.id ?? null,
        };
      }

      const [design, profile] = await Promise.all([
        prisma.venueDesign.findUniqueOrThrow({
          where: { id: input.designId },
          select: { name: true, guest_count: true },
        }),
        prisma.profile.findUnique({
          where: { id: ctx.user.id },
          select: { full_name: true, phone: true, locale: true },
        }),
      ]);
      const fullName =
        profile?.full_name || ctx.user.email?.split("@")[0] || "A couple";

      // ---- The row. Everything after this point is best-effort. ----
      const enquiry = await prisma.enquiry.create({
        data: {
          user_id: ctx.user.id,
          full_name: fullName,
          email: ctx.user.email ?? null,
          phone: profile?.phone ?? null,
          preferred_channel: "whatsapp",
          guest_band: design.guest_count ? String(design.guest_count) : null,
          design_id: input.designId,
          source: "design_approved",
          locale: profile?.locale ?? null,
          pricing_published: isFlagEnabled("publishedPricing"),
        },
        select: { id: true },
      });

      try {
        await notifyDesignApproved({
          enquiryId: enquiry.id,
          coupleName: fullName,
          designName: design.name,
        });
      } catch (err) {
        reportError("design_approve.notify_failed", err, {
          enquiryId: enquiry.id,
        });
      }

      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_APPROVED, {
        design_id: input.designId,
        enquiry_id: enquiry.id,
        from: "free_approve",
      });

      return {
        ok: true as const,
        alreadyApproved: false as const,
        enquiryId: enquiry.id,
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const [designs, pack] = await Promise.all([
      prisma.venueDesign.findMany({
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
          // Latest generated render for this design, used as the card hero
          // thumbnail. We filter to "render" because videos can't be cheaply
          // poster-extracted on the server.
          media: {
            where: { type: "render" },
            orderBy: { created_at: "desc" },
            take: 1,
            select: { url: true, cloudinary_public_id: true, type: true },
          },
        },
      }),
      loadActivePackForUser(ctx.user.id),
    ]);

    const isFreeTier = isFreePack(pack?.sku);
    return designs.map((d) => ({
      ...d,
      media: d.media.map((m) => ({
        url: urlForTier(m, isFreeTier),
      })),
    }));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [design, pack] = await Promise.all([
        prisma.venueDesign.findFirst({
          where: { id: input.id, user_id: ctx.user.id },
          include: { media: { orderBy: { created_at: "desc" } } },
        }),
        loadActivePackForUser(ctx.user.id),
      ]);
      if (!design) return null;
      const isFreeTier = isFreePack(pack?.sku);
      return {
        ...design,
        media: design.media.map((m) => ({
          ...m,
          url: urlForTier(m, isFreeTier),
        })),
      };
    }),

  /**
   * Fetch a single render media row by id. Used by the magic-link
   * reveal page `/r/[renderId]` after the email-gate flow. Returns the
   * tier-appropriate URL (watermarked for free tier, clean for paid).
   * Scoped to the caller's own designs so a leaked render id can't
   * expose someone else's preview.
   */
  getRenderById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [media, pack] = await Promise.all([
        prisma.venueDesignMedia.findFirst({
          where: {
            id: input.id,
            type: "render",
            design: { user_id: ctx.user.id },
          },
          select: {
            id: true,
            type: true,
            url: true,
            cloudinary_public_id: true,
            created_at: true,
            design: {
              select: {
                id: true,
                name: true,
                event_type: true,
                setting: true,
                size: true,
                guest_count: true,
                palette: true,
              },
            },
          },
        }),
        loadActivePackForUser(ctx.user.id),
      ]);
      if (!media) return null;
      const isFreeTier = isFreePack(pack?.sku);
      return {
        id: media.id,
        url: urlForTier(media, isFreeTier),
        watermarked: isFreeTier,
        created_at: media.created_at,
        design: media.design,
        packSku: pack?.sku ?? null,
      };
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
      // Couple-journey funnel, top of the design step. We only fire on
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
        // Must be a CDN URL, we explicitly reject inline `data:` URIs here
        // because storing multi-MB base64 strings in `venue_design_media.url`
        // bloats every downstream read (marketing teaser, message previews,
        // dashboards). Both the AI scene generator and the video generator
        // upload to Cloudinary before this point and pass the secure URL.
        //
        // Important: callers pass the **clean** (un-watermarked) URL. The
        // free-tier watermark is derived on read via `cloudinary_public_id`
        // so an upgrade flips every existing render to clean without
        // touching media rows.
        url: z
          .string()
          .min(1)
          .refine((u) => !u.startsWith("data:"), {
            message: "media url must be a CDN URL, not an inline data URI",
          }),
        // Cloudinary public_id used to derive watermarked / optimized
        // URLs at read time. Nullable for provider-hosted assets that
        // bypass our Cloudinary pipeline.
        cloudinary_public_id: z.string().nullish(),
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
          cloudinary_public_id: input.cloudinary_public_id ?? null,
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
