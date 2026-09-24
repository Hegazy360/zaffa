import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { router, protectedProcedure, nonAnonymousProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { cloudinary, watermarkedUrl } from "@/lib/cloudinary";
import { isFreePack } from "@/lib/vision-pack";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { reportError } from "@/lib/logger";
import { isFlagEnabled } from "@/lib/flags";
import { enforceTrpc } from "@/lib/rate-limit";
import {
  parseMediaMeta,
  parseVenuePhoto,
  toClientMediaMeta,
  venuePhotoSchema,
  type VenuePhoto,
} from "@/lib/design-media-meta";
import {
  compareBeforePhoto,
  isOwnVenuePublicId,
  venuePhotoFolder,
} from "@/lib/venue-photo";
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
 * Accept a venue photo only if it is one `uploadVenuePhoto` could have
 * handed THIS user: served from our own Cloudinary account, with a public
 * id inside their venue folder, and a URL that actually points at that
 * public id. Anything else is a client trying to attach an arbitrary or
 * foreign image, answered with a stable BAD_REQUEST code.
 */
function assertOwnVenuePhoto(photo: VenuePhoto, userId: string): void {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const invalid = () =>
    new TRPCError({ code: "BAD_REQUEST", message: "VENUE_PHOTO_INVALID" });
  if (!cloudName) throw invalid();
  if (!photo.url.startsWith(`https://res.cloudinary.com/${cloudName}/`)) {
    throw invalid();
  }
  if (!isOwnVenuePublicId(photo.publicId, userId)) throw invalid();
  // `.../image/upload/v123/<publicId>.jpg`: the URL must be the asset the
  // public id names, not some other file in our account.
  const path = new URL(photo.url).pathname.replace(/\.[a-z0-9]+$/i, "");
  if (!path.endsWith(`/${photo.publicId}`)) throw invalid();
}

/**
 * Upper bound on an uploaded venue photo's data URL. The client downscales
 * to at most 2048px JPEG (a few hundred KB), and Vercel refuses request
 * bodies over 4.5MB anyway, so this only ever stops a hand-built request
 * from making us buffer and forward something huge to Cloudinary.
 */
const VENUE_PHOTO_MAX_DATA_URL_CHARS = 7_000_000;

// Shown by the reference picker as is (it toasts `err.message`), so it is
// written for the couple rather than as a reason code.
const UPLOAD_RATE_LIMITED =
  "Too many uploads for now. Please try again in an hour.";

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

/**
 * The venue photo to show as the "before" of a render on the reveal page,
 * or null. Reads the design's render rows once and walks the refinement
 * chain in memory (`compareBeforePhoto`), so a talked edit of a dressed
 * render still gets its slider. The photo must sit in the caller's own
 * folder, the same proof `save` demanded when it was attached.
 */
async function dressedVenueBefore(
  mediaId: string,
  designId: string,
  photo: VenuePhoto | null,
  userId: string,
): Promise<VenuePhoto | null> {
  if (!photo || !isFlagEnabled("venuePhoto")) return null;
  if (!isOwnVenuePublicId(photo.publicId, userId)) return null;
  const rows = await prisma.venueDesignMedia.findMany({
    where: { design_id: designId, type: "render" },
    select: { id: true, parent_id: true, meta: true },
  });
  const lineage = rows.map((r) => {
    const meta = parseMediaMeta(r.meta);
    return {
      id: r.id,
      parent_id: r.parent_id,
      mode: meta?.mode ?? null,
      venuePublicId: meta?.venuePublicId ?? null,
    };
  });
  return compareBeforePhoto(mediaId, lineage, photo);
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
        // JSON columns come back parsed and typed, never raw: a malformed
        // value reads as null rather than reaching the client half-shaped.
        venue_photo: parseVenuePhoto(design.venue_photo),
        // `cloudinary_public_id` is used here and not sent, because no
        // client reads it. Do not mistake that for protecting the clean
        // render: the watermarked URL a free-tier couple gets carries the
        // same public id in its path (see `watermarkedUrl`).
        media: design.media.map(({ cloudinary_public_id, meta, ...m }) => ({
          ...m,
          url: urlForTier({ ...m, cloudinary_public_id }, isFreeTier),
          // Only the couple-facing slice (mode, their instruction, our
          // confirmation). The model id and what we paid stay server-side.
          meta: toClientMediaMeta(meta),
        })),
      };
    }),

  /**
   * Fetch a single render media row by id. Used by the magic-link
   * reveal page `/r/[renderId]` after the email-gate flow. Returns the
   * tier-appropriate URL (watermarked for free tier, clean for paid).
   * Scoped to the caller's own designs so a leaked render id can't
   * expose someone else's preview.
   *
   * When the render dressed the couple's venue photo (or was refined from
   * one that did) it also returns that photo, the "before" of the reveal's
   * compare slider. Same rule as the designer (`compareBeforePhoto`), and
   * nothing at all while the venuePhoto kill switch is off.
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
                venue_photo: true,
              },
            },
          },
        }),
        loadActivePackForUser(ctx.user.id),
      ]);
      if (!media) return null;
      const isFreeTier = isFreePack(pack?.sku);
      const { venue_photo: venuePhotoJson, ...design } = media.design;
      const before = await dressedVenueBefore(
        media.id,
        design.id,
        parseVenuePhoto(venuePhotoJson),
        ctx.user.id,
      );
      return {
        id: media.id,
        url: urlForTier(media, isFreeTier),
        watermarked: isFreeTier,
        created_at: media.created_at,
        design,
        packSku: pack?.sku ?? null,
        // The couple's own photo, never watermarked: it is theirs.
        venuePhotoUrl: before?.url ?? null,
        venuePhotoWidth: before?.width ?? null,
        venuePhotoHeight: before?.height ?? null,
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
        // The couple's venue photo (F1), as returned by `uploadVenuePhoto`.
        // Omitted leaves the stored photo alone (older clients never send
        // it), null removes it.
        venue_photo: venuePhotoSchema.nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.venue_photo) assertOwnVenuePhoto(input.venue_photo, ctx.user.id);
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
        ...(input.venue_photo === undefined
          ? {}
          : {
              // A nullable Json column is cleared with DbNull; a bare null
              // is not a valid Prisma JSON input.
              venue_photo: input.venue_photo ?? Prisma.DbNull,
            }),
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
      if (media.type !== "render") {
        return prisma.venueDesignMedia.delete({ where: { id: input.id } });
      }
      // A render's changes (F2) hang off it by `parent_id`, which the
      // schema sets to NULL on delete. Hand them to the deleted version's
      // own parent instead, so deleting a change in the middle keeps the
      // ones made from it in their lineage (the venue photo, its rules and
      // the before/after slider follow it, see `findDressVenueAncestor`).
      // Renders only: a video belongs to the render it was made from and
      // is not moved onto another one.
      const [, deleted] = await prisma.$transaction([
        prisma.venueDesignMedia.updateMany({
          where: {
            parent_id: media.id,
            design_id: media.design_id,
            type: "render",
          },
          data: { parent_id: media.parent_id },
        }),
        prisma.venueDesignMedia.delete({ where: { id: input.id } }),
      ]);
      return deleted;
    }),

  uploadReference: protectedProcedure
    .input(
      z.object({
        dataUrl: z.string().min(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await enforceTrpc("imageUpload", ctx.user.id, UPLOAD_RATE_LIMITED);
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
      // Same bucket as the other uploads: this one makes Cloudinary fetch
      // an arbitrary URL on our account, so it is the likeliest to loop.
      await enforceTrpc("imageUpload", ctx.user.id, UPLOAD_RATE_LIMITED);
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

  /**
   * F1: upload a photo of the couple's own venue, the canvas a dress-venue
   * render decorates. Returns the shape `save` accepts as `venue_photo`;
   * the photo is attached to a design only when the design is saved with
   * it, so an abandoned upload never changes a design.
   *
   * Separate from `uploadReference` on purpose: a different folder per
   * user (`zaffa-venues/<uid>/`, which is what `save` and the render path
   * check ownership against), JPEG/PNG/WebP only, a size cap, and the
   * dimensions back so the client can lay out a before/after compare
   * without loading the image first. Anonymous sessions may upload: the
   * venue step comes before the email gate.
   */
  uploadVenuePhoto: protectedProcedure
    .input(
      z.object({
        dataUrl: z
          .string()
          .max(VENUE_PHOTO_MAX_DATA_URL_CHARS)
          .regex(/^data:image\/(jpeg|png|webp);base64,/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Kill switch, checked here as well as in the UI because this is
      // the check that cannot lag a flag flip.
      if (!isFlagEnabled("venuePhoto")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "VENUE_PHOTO_DISABLED",
        });
      }
      await enforceTrpc("imageUpload", ctx.user.id, UPLOAD_RATE_LIMITED);

      const result = await cloudinary.uploader.upload(input.dataUrl, {
        folder: venuePhotoFolder(ctx.user.id),
        resource_type: "image",
        type: "upload",
      });
      const photo: VenuePhoto = {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      };
      // What we hand back must be something `save` will accept. If the
      // Cloudinary account's folder mode ever stops prefixing public ids
      // with the folder, every save would start failing with
      // VENUE_PHOTO_INVALID; this makes that loud at the upload instead.
      try {
        assertOwnVenuePhoto(venuePhotoSchema.parse(photo), ctx.user.id);
      } catch (err) {
        reportError("venue_designs.venue_photo_shape_unexpected", err, {
          userId: ctx.user.id,
          publicId: result.public_id,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "VENUE_PHOTO_UPLOAD_FAILED",
        });
      }

      // Fired here, server-side, once per successful upload. The client
      // should not fire it again when it attaches the photo.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_VENUE_PHOTO_ADDED, {
        width: photo.width,
        height: photo.height,
      });
      return photo;
    }),
});
