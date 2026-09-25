import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { router, protectedProcedure, nonAnonymousProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import {
  cloudinary,
  referenceAsVenueSourceUrl,
  watermarkedUrl,
} from "@/lib/cloudinary";
import { publicIdFromDeliveryUrl } from "@/lib/cloudinary-url";
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
  isOwnReferencePublicId,
  isOwnVenuePublicId,
  referenceFolder,
  venuePhotoFolder,
} from "@/lib/venue-photo";
import { notifyDesignApproved } from "@/server/services/notifications/dispatchers";
import {
  leadDetailsSchema,
  normalizePhone,
  parseWeddingDate,
  type LeadDetails,
} from "@/lib/lead-details";

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

/** Approval details, validated by the schema and put in the shape we store. */
interface ResolvedLeadDetails {
  phone?: string;
  eventDate?: { date: Date; monthOnly: boolean };
  city?: string;
  country?: string;
}

function resolveLeadDetails(input: LeadDetails): ResolvedLeadDetails {
  return {
    phone: (input.phone && normalizePhone(input.phone)) || undefined,
    eventDate: (input.eventDate && parseWeddingDate(input.eventDate)) || undefined,
    city: input.city || undefined,
    country: input.country || undefined,
  };
}

/**
 * Complete an existing approval lead with details the couple gave later,
 * never overwriting one: each field is its own conditional write, matched
 * only while that field is still empty, so the answer is decided by the row
 * at write time rather than by a read that might be stale. Returns whether
 * anything was filled.
 */
async function fillEmptyEnquiryFields(
  enquiryId: string,
  details: ResolvedLeadDetails,
): Promise<boolean> {
  const writes: Array<Promise<{ count: number }>> = [];
  if (details.phone) {
    writes.push(
      prisma.enquiry.updateMany({
        where: { id: enquiryId, OR: [{ phone: null }, { phone: "" }] },
        // The number is a WhatsApp number (that is what the dialog asks for).
        data: { phone: details.phone, preferred_channel: "whatsapp" },
      }),
    );
  }
  if (details.eventDate) {
    writes.push(
      prisma.enquiry.updateMany({
        where: { id: enquiryId, event_date: null },
        data: {
          event_date: details.eventDate.date,
          date_flexible: details.eventDate.monthOnly,
        },
      }),
    );
  }
  if (details.city) {
    writes.push(
      prisma.enquiry.updateMany({
        where: { id: enquiryId, OR: [{ city: null }, { city: "" }] },
        data: { city: details.city },
      }),
    );
  }
  if (details.country) {
    writes.push(
      prisma.enquiry.updateMany({
        where: { id: enquiryId, country: null },
        data: { country: details.country },
      }),
    );
  }
  if (writes.length === 0) return false;
  const results = await Promise.all(writes);
  return results.some((r) => r.count > 0);
}

/**
 * Keep the number on the profile too, when the profile has none, so the
 * next lead from this couple starts with it. Best-effort: the lead already
 * carries the number, and a profile write must not fail the approval.
 */
async function fillProfilePhone(userId: string, phone: string): Promise<void> {
  try {
    await prisma.profile.updateMany({
      where: { id: userId, OR: [{ phone: null }, { phone: "" }] },
      data: { phone },
    });
  } catch (err) {
    reportError("design_approve.profile_phone_failed", err, { userId });
  }
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
   *
   * F5: the couple may leave a WhatsApp number, the wedding month (or day)
   * and where it is, all optional, and the version on screen is pinned as
   * `selected_media_id`. A second approve (another tab, a stale page, the
   * details added after the fact) never files a second lead: it fills the
   * existing enquiry's EMPTY fields, one conditional write per field, so
   * nothing already on the lead is overwritten.
   */
  approve: nonAnonymousProcedure
    .input(
      leadDetailsSchema.extend({
        designId: z.string().uuid(),
        // The version the couple is looking at when they approve (the decor
        // plan prices one render). Pinned as `selected_media_id` so the
        // team, the lookbook and the brief quote that one.
        mediaId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.mediaId) {
        // Scoped to the caller's own design as well: a probe with someone
        // else's ids gets the same answer as an id that does not exist.
        const media = await prisma.venueDesignMedia.findFirst({
          where: {
            id: input.mediaId,
            design_id: input.designId,
            type: "render",
            design: { user_id: ctx.user.id },
          },
          select: { id: true },
        });
        if (!media) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "MEDIA_NOT_IN_DESIGN" });
        }
      }

      const details = resolveLeadDetails(input);
      const where = { id: input.designId, user_id: ctx.user.id };
      const findLead = (tx: Prisma.TransactionClient) =>
        tx.enquiry.findFirst({
          where: { design_id: input.designId, source: "design_approved" },
          orderBy: { created_at: "desc" },
          select: { id: true },
        });

      // The approval and its lead are ONE write. They used to be two: when
      // the create failed after `approved_at` was flipped, every retry took
      // the already-approved branch, found no lead and still answered "our
      // team has it", while every surface showed the design as approved.
      // Now a failed create rolls the approval back and the retry files it.
      const outcome = await prisma.$transaction(async (tx) => {
        // Conditional write doubles as the idempotency guard: only the call
        // that flips `approved_at` from null goes on to file the lead, and
        // the row lock it holds until commit makes a concurrent twin wait
        // here and then find that lead, so admins are never notified twice.
        const flipped = await tx.venueDesign.updateMany({
          where: { ...where, approved_at: null },
          data: {
            approved_at: new Date(),
            ...(input.mediaId ? { selected_media_id: input.mediaId } : {}),
          },
        });

        let recovered = false;
        if (flipped.count === 0) {
          const design = await tx.venueDesign.findFirst({ where, select: { id: true } });
          if (!design) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Design not found" });
          }
          const existing = await findLead(tx);
          if (existing) {
            // The latest word on which version wins: a couple approving
            // from a page showing another version means that one now.
            if (input.mediaId) {
              await tx.venueDesign.updateMany({
                where,
                data: { selected_media_id: input.mediaId },
              });
            }
            return { enquiryId: existing.id, created: false as const };
          }
          // Approved with no lead to show for it (an approval from before
          // the two were one write lost its create): file it now rather
          // than tell the couple the team has it. Re-stamping takes the row
          // lock, so a twin doing the same waits, then finds this lead.
          await tx.venueDesign.updateMany({
            where,
            data: {
              approved_at: new Date(),
              ...(input.mediaId ? { selected_media_id: input.mediaId } : {}),
            },
          });
          const filedMeanwhile = await findLead(tx);
          if (filedMeanwhile) {
            return { enquiryId: filedMeanwhile.id, created: false as const };
          }
          recovered = true;
        }

        const [design, profile] = await Promise.all([
          tx.venueDesign.findUniqueOrThrow({
            where: { id: input.designId },
            select: { name: true, guest_count: true },
          }),
          tx.profile.findUnique({
            where: { id: ctx.user.id },
            select: { full_name: true, phone: true, locale: true },
          }),
        ]);
        const fullName =
          profile?.full_name || ctx.user.email?.split("@")[0] || "A couple";
        const phone = details.phone ?? (profile?.phone || null);

        // ---- The row. Everything after the transaction is best-effort. ----
        const enquiry = await tx.enquiry.create({
          data: {
            user_id: ctx.user.id,
            full_name: fullName,
            email: ctx.user.email ?? null,
            phone,
            // WhatsApp when there is a number to reach, else the email we
            // always have: a channel we cannot use is not a preference.
            preferred_channel: phone ? "whatsapp" : "email",
            country: details.country ?? null,
            city: details.city ?? null,
            event_date: details.eventDate?.date ?? null,
            date_flexible: details.eventDate?.monthOnly ?? false,
            guest_band: design.guest_count ? String(design.guest_count) : null,
            design_id: input.designId,
            source: "design_approved",
            locale: profile?.locale ?? null,
            pricing_published: isFlagEnabled("publishedPricing"),
          },
          select: { id: true },
        });
        return {
          enquiryId: enquiry.id,
          created: true as const,
          recovered,
          fullName,
          designName: design.name,
          hasPhone: Boolean(phone),
        };
      });

      if (!outcome.created) {
        // Already approved: hand back the existing lead so the UI can show
        // the same "we're on it" state without creating a duplicate, and
        // complete it with whatever the couple has now told us.
        const detailsAdded = await fillEmptyEnquiryFields(outcome.enquiryId, details);
        if (details.phone) await fillProfilePhone(ctx.user.id, details.phone);
        return {
          ok: true as const,
          alreadyApproved: true as const,
          enquiryId: outcome.enquiryId,
          detailsAdded,
        };
      }

      if (details.phone) await fillProfilePhone(ctx.user.id, details.phone);

      try {
        await notifyDesignApproved({
          enquiryId: outcome.enquiryId,
          coupleName: outcome.fullName,
          designName: outcome.designName,
        });
      } catch (err) {
        reportError("design_approve.notify_failed", err, {
          enquiryId: outcome.enquiryId,
        });
      }

      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_APPROVED, {
        design_id: input.designId,
        enquiry_id: outcome.enquiryId,
        from: "free_approve",
        pinned_version: Boolean(input.mediaId),
        has_phone: outcome.hasPhone,
        has_date: Boolean(details.eventDate),
        has_place: Boolean(details.city || details.country),
        recovered: outcome.recovered,
      });

      return {
        ok: true as const,
        alreadyApproved: false as const,
        enquiryId: outcome.enquiryId,
        detailsAdded: false,
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
            select: { id: true, url: true, cloudinary_public_id: true, type: true },
          },
        },
      }),
      loadActivePackForUser(ctx.user.id),
    ]);

    const isFreeTier = isFreePack(pack?.sku);
    return designs.map((d) => ({
      ...d,
      media: d.media.map((m) => ({
        // The card's approve pins the version its thumbnail shows (F5).
        id: m.id,
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
        folder: referenceFolder(ctx.user.id),
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
        folder: referenceFolder(ctx.user.id),
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
      return acceptVenueUpload(result, ctx.user.id, "upload");
    }),

  /**
   * F3: the intake check thought one of the couple's reference uploads is a
   * photo of their own empty venue, and they agreed ("Use it as the
   * canvas"). Copies it into their venue folder and returns the shape
   * `save` accepts as `venue_photo`, exactly like `uploadVenuePhoto`; the
   * client then attaches it and drops the reference.
   *
   * Only the caller's own reference images qualify, proven from the URL:
   * our Cloudinary account, the plain delivery shape, a public id inside
   * `zaffa-references/<uid>/`. The copy is then made from a URL built here
   * from that public id, never from the URL the client sent, so this cannot
   * make Cloudinary fetch anything else.
   */
  promoteReferenceToVenue: protectedProcedure
    .input(z.object({ url: z.string().url().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      // The same kill switch as uploading a venue photo: this makes one.
      if (!isFlagEnabled("venuePhoto")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "VENUE_PHOTO_DISABLED",
        });
      }
      const publicId = publicIdFromDeliveryUrl(
        input.url,
        process.env.CLOUDINARY_CLOUD_NAME,
      );
      if (!publicId || !isOwnReferencePublicId(publicId, ctx.user.id)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "REFERENCE_NOT_PROMOTABLE",
        });
      }
      await enforceTrpc("imageUpload", ctx.user.id, UPLOAD_RATE_LIMITED);

      let result: CloudinaryUpload;
      try {
        result = await cloudinary.uploader.upload(
          referenceAsVenueSourceUrl(publicId),
          {
            folder: venuePhotoFolder(ctx.user.id),
            resource_type: "image",
            type: "upload",
          },
        );
      } catch (err) {
        reportError("venue_designs.promote_reference_failed", err, {
          userId: ctx.user.id,
          publicId,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "VENUE_PHOTO_UPLOAD_FAILED",
        });
      }
      return acceptVenueUpload(result, ctx.user.id, "reference");
    }),
});

type CloudinaryUpload = {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
};

/**
 * The venue photo a fresh Cloudinary upload into the caller's venue folder
 * becomes, checked to be one `save` will accept, and counted.
 */
async function acceptVenueUpload(
  result: CloudinaryUpload,
  userId: string,
  source: "upload" | "reference",
): Promise<VenuePhoto> {
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
    assertOwnVenuePhoto(venuePhotoSchema.parse(photo), userId);
  } catch (err) {
    reportError("venue_designs.venue_photo_shape_unexpected", err, {
      userId,
      publicId: result.public_id,
      source,
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "VENUE_PHOTO_UPLOAD_FAILED",
    });
  }

  // Fired here, server-side, once per photo that joins a venue folder. The
  // client should not fire it again when it attaches the photo.
  await trackServer(userId, ANALYTICS_EVENTS.DESIGN_VENUE_PHOTO_ADDED, {
    width: photo.width,
    height: photo.height,
    source,
  });
  return photo;
}
