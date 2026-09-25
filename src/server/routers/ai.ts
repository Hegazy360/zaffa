import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { dressVenueScene, renderScene } from "../ai/scene-generator";
import { startVideoGeneration, getVideoStatus } from "../ai/video-generator";
import {
  enforceTrpc,
  enforceTrpcMany,
  ipFromRequest,
} from "@/lib/rate-limit";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import {
  consumeQuota,
  ensureFreePack,
  releaseEdit,
  requireActivePack,
  reserveEdit,
} from "./vision-packs";
import { isFreePack, packAllowsVideo } from "@/lib/vision-pack";
import {
  renderModelInputUrl,
  venueModelInputUrl,
  watermarkedUrl,
} from "@/lib/cloudinary";
import { verifyTurnstile } from "@/lib/turnstile";
import { prisma } from "@/lib/prisma";
import { logger, reportError } from "@/lib/logger";
import {
  parseMediaMeta,
  parseVenuePhoto,
  type MediaMeta,
  type MediaMode,
} from "@/lib/design-media-meta";
import { isFlagEnabled } from "@/lib/flags";
import { compareBeforePhoto, isOwnVenuePublicId } from "@/lib/venue-photo";
import {
  LOCALE_COOKIE,
  defaultLocale,
  isLocale,
  locales,
  type Locale,
} from "@/i18n/config";
import {
  REFINE_INSTRUCTION_MAX,
  RefineNormaliserUnavailable,
  normaliseRefineInstruction,
  refineRequestLooksUnsafe,
  refineScene,
  type RefineNormalisation,
} from "../ai/refine";
import { checkIntake, type IntakeResult } from "../ai/intake";

const referenceCategorySchema = z.enum([
  "overall_vibe",
  "tables",
  "flowers",
  "lighting",
  "venue_decor",
]);

const renderReferenceSchema = z.object({
  url: z.string().min(1),
  category: referenceCategorySchema,
});

/** Every render we generate is mirrored into this folder (see image-gen). */
const RENDERS_FOLDER = "zaffa-renders/";

/** The couple's locale: what the client says, else the cookie, else en. */
function requestLocale(req: Request | null, fromInput: Locale | undefined): Locale {
  if (fromInput) return fromInput;
  const cookie = req?.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isLocale(value) ? value : defaultLocale;
}

/** `#fff, #d4af37 (Blush and gold)` from the stored palette, or null. */
function paletteSummary(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const { name, colors } = json as { name?: unknown; colors?: unknown };
  const list = Array.isArray(colors)
    ? colors.filter((c): c is string => typeof c === "string").slice(0, 8)
    : [];
  if (list.length === 0) return null;
  return typeof name === "string" && name.trim()
    ? `${list.join(", ")} (${name.trim().slice(0, 80)})`
    : list.join(", ");
}

/**
 * Hand back an edit reserved by `reserveEdit`. A failed release is reported
 * and swallowed: it must not replace the error the couple needs to see,
 * and the worst case is one edit short, which support can restore.
 */
async function releaseEditQuietly(
  packId: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await releaseEdit(packId);
  } catch (err) {
    reportError("ai.refine_release_failed", err, { packId, ...context });
  }
}

export const aiRouter = router({
  renderScene: protectedProcedure
    .input(
      z.object({
        eventType: z.enum([
          "wedding",
          "engagement",
          "birthday",
          "corporate",
          "other",
        ]),
        setting: z.enum(["indoor", "outdoor", "tent"]),
        size: z.enum(["intimate", "medium", "large"]),
        // Optional precise count - when present, the scene generator uses
        // it verbatim in the layout descriptor instead of the bucket sample.
        guestCount: z.number().int().min(2).max(10000).nullish(),
        palette: z.object({
          name: z.string().optional(),
          colors: z.array(z.string()).max(8).default([]),
        }),
        references: z.array(renderReferenceSchema).max(10),
        styleNotes: z.string().max(2000).optional(),
        // The clean English brief `checkIntake` wrote from the couple's own
        // words (F3), when the check ran for these inputs. The prompt
        // carries it next to the raw notes, never instead of them.
        briefEn: z.string().trim().max(1200).nullish(),
        // Cloudflare Turnstile token. Anonymous visitors must always
        // send one when `TURNSTILE_SECRET_KEY` is configured (prod);
        // paid users skip the bot check entirely (see below).
        turnstileToken: z.string().max(2048).nullish(),
        // The design this render belongs to. When present the server
        // writes the media row itself and returns its id. Optional so a
        // client built before server-side persistence keeps working: it
        // gets `cleanImageUrl` back and saves through `saveMedia` as
        // before.
        designId: z.string().uuid().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Bot protection on anonymous Generate. Verified BEFORE we mint
      // a free pack so a captcha failure can't burn a quota slot or
      // create stray DB rows. Paid users (`is_anonymous=false` and
      // already past the email gate at signup) are exempt, they've
      // committed money, they're not bot traffic.
      if (ctx.user.is_anonymous) {
        const ip = ctx.req ? ipFromRequest(ctx.req) : null;
        const tsResult = await verifyTurnstile(input.turnstileToken, ip);
        if (!tsResult.ok) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "TURNSTILE_FAILED",
          });
        }
      }

      // The render is written onto this design after it is paid for, so
      // the design must be the caller's BEFORE anything is spent or a free
      // pack is minted. A foreign or deleted id is a NOT_FOUND here, not a
      // paid render whose row then fails to insert.
      const designId = input.designId ?? null;
      // The couple's venue photo, when this render should dress it (F1).
      // Resolved from the design row on the server, never from the
      // request: the image model fetches whatever URL we hand it, so a
      // client-chosen URL would let anyone bill us for dressing any photo
      // on the internet, or someone else's venue.
      let venue: { url: string; publicId: string } | null = null;
      if (designId) {
        const owned = await prisma.venueDesign.findFirst({
          where: { id: designId, user_id: ctx.user.id },
          select: { id: true, venue_photo: true },
        });
        if (!owned) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Design not found" });
        }
        const photo = parseVenuePhoto(owned.venue_photo);
        // Checked here as well as in the UI: the procedure is the kill
        // switch that cannot lag a flag flip. Off renders the old way.
        if (photo && isFlagEnabled("venuePhoto")) {
          if (isOwnVenuePublicId(photo.publicId, ctx.user.id)) {
            venue = {
              url: venueModelInputUrl(photo.publicId),
              publicId: photo.publicId,
            };
          } else {
            // `save` only ever stores a photo from the caller's own folder,
            // so this is a hand-edited or corrupted row. Render without it
            // rather than refuse the couple their render, and say so.
            reportError(
              "ai.render_scene.venue_photo_foreign",
              new Error("venue photo outside the caller's folder"),
              { userId: ctx.user.id, designId, publicId: photo.publicId },
            );
          }
        }
      }
      const mode: MediaMode = venue ? "dress_venue" : "generate";

      // Nothing to render from: no mood reference and no venue photo we
      // can use. The panel lets a couple render on their venue photo alone,
      // so this is a venue render that lost its photo on the way (no design
      // id, the kill switch flipped mid-session, a photo outside their
      // folder). They asked for their venue, not an imagined hall, so it is
      // refused before a free pack is minted or a render is counted.
      if (!venue && input.references.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "REFERENCES_REQUIRED",
        });
      }

      // Free-tier auto-grant: anonymous (or not-yet-paid) users hitting
      // generate get an `active` free pack created on the fly. Idempotent,
      // and once per person: someone whose packs already produced anything
      // gets nothing new, and the gate below answers PACK_REQUIRED.
      await ensureFreePack(ctx.user.id);

      // Paywall gate: require an active Vision Pack with renders quota
      // remaining. Throws FORBIDDEN with a stable message string the UI
      // pattern-matches on (PACK_REQUIRED / PACK_QUOTA_RENDERS /
      // PACK_WINDOW_EXPIRED) to surface the right modal.
      const pack = await requireActivePack(ctx.user.id, "render");
      // Per-hour burst cap + per-day cost ceiling. Even on a paid pack
      // these stay, they're independent abuse protection (a single user
      // shouldn't cost us $100 of OpenAI in five minutes regardless of
      // whether they paid 499 EGP).
      await enforceTrpcMany(
        [
          {
            key: "aiRender",
            message: "Render limit reached. Please try again in an hour.",
          },
          {
            key: "aiRenderDaily",
            message:
              "Daily render limit reached. Try again tomorrow or contact support to lift the cap.",
          },
        ],
        ctx.user.id,
      );

      // Free-tier extra protection: a per-IP limiter that catches anyone
      // spinning up fresh anonymous Supabase users to dodge the per-user
      // quota. Doesn't apply to paid packs, those users have already
      // committed.
      //
      // Throws the stable `FREE_RENDER_RATE_LIMITED` reason code (not a
      // user-facing string) so `paywall.handleError` on the client can
      // route this through the same modal as `PACK_REQUIRED` etc. The
      // modal renders a dedicated headline for this reason that
      // explains the limit and surfaces the buy CTAs inline.
      if (isFreePack(pack.sku)) {
        const ip = ctx.req ? ipFromRequest(ctx.req) : "unknown";
        await enforceTrpc("aiRenderFreePerIp", ip, "FREE_RENDER_RATE_LIMITED");
      }

      // Same quota, limits and bot check as a prompt-only render: dressing
      // a photo is still one render to the couple, and cheaper to us.
      let result: Awaited<ReturnType<typeof renderScene>>;
      if (venue) {
        try {
          result = await dressVenueScene(input, venue);
        } catch (err) {
          reportError("ai.render_scene.dress_venue_failed", err, {
            userId: ctx.user.id,
            designId,
            publicId: venue.publicId,
          });
          throw err;
        }
      } else {
        result = await renderScene(input);
      }
      // Atomically decrement the quota. Done after a successful render
      // so a failed OpenAI call doesn't burn a slot from the pack.
      await consumeQuota(pack.id, "render");

      // Persist the public id so future tier-aware URL selection (and
      // the watermark transformation) can re-derive URLs without
      // parsing `secure_url`. Falls through to a URL passthrough when
      // the upload pipeline didn't return a public id (e.g. a remote
      // CDN URL passed by the provider).
      const cleanUrl = result.imageUrl;
      const publicId = result.publicId ?? null;

      // Tier-aware response: free-tier renders get the watermarked
      // signed Cloudinary URL; paid tiers see the clean asset. After
      // an upgrade the same row's `imageUrl` flips automatically, no
      // re-render required (see `venueDesigns.list` / `getById`).
      const imageUrl =
        isFreePack(pack.sku) && publicId
          ? watermarkedUrl(publicId)
          : cleanUrl;

      // Server-side persistence. The client used to save the row itself
      // through `saveMedia` once this call returned, which lost the paid
      // render whenever the tab closed during the ~24s wait, the first
      // design save had not resolved yet, or the follow-up call failed (6
      // of the first 10 real designs have no image). The row is written
      // here instead, with the clean URL (the tier watermark is derived on
      // read) and the provenance the version strip and cost reports read.
      //
      // A failed insert must not fail the request. The couple has already
      // been charged a render, so they get the image either way; the
      // response then falls back to the old shape (below) so the client
      // can still try `saveMedia`.
      let mediaId: string | null = null;
      if (designId) {
        // `satisfies` rather than a `MediaMeta` annotation: the schema's
        // loose index signature is not a Prisma JSON input, this literal is.
        const meta = {
          mode,
          model: result.model,
          ...(result.costUsd != null ? { costUsd: result.costUsd } : {}),
          // Which photo was the "before", so the compare slider can tell
          // whether the photo on the design now is still this one.
          ...(venue ? { venuePublicId: venue.publicId } : {}),
        } satisfies MediaMeta;
        try {
          const row = await prisma.venueDesignMedia.create({
            data: {
              design_id: designId,
              type: "render",
              url: cleanUrl,
              cloudinary_public_id: publicId,
              meta,
            },
            select: { id: true },
          });
          mediaId = row.id;
          // Bump the design so "My designs" (ordered by updated_at) puts
          // the design just rendered on top.
          await prisma.venueDesign.update({
            where: { id: designId },
            data: { updated_at: new Date() },
            select: { id: true },
          });
        } catch (err) {
          reportError("ai.render_scene.persist_failed", err, {
            userId: ctx.user.id,
            designId,
            mediaId,
            publicId,
          });
        }
      }

      // Couple-journey funnel, every successful AI render is a step
      // toward a finished design. Tracking the input shape (event type,
      // setting, palette size) lets us compare conversion across config.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_RENDER_GENERATED, {
        mode,
        event_type: input.eventType,
        setting: input.setting,
        size: input.size,
        guest_count: input.guestCount ?? null,
        reference_count: input.references.length,
        pack_id: pack.id,
        sku: pack.sku,
        design_id: designId,
        persisted: mediaId !== null,
        has_brief: Boolean(input.briefEn),
      });

      return {
        // The clean asset and its public id only go back when the server
        // did NOT write the row, for the old client flow that saves it
        // through `saveMedia`. Once the row exists the client has no use
        // for them, so they stay home. That is tidiness, not protection:
        // the watermarked `imageUrl` carries the public id in its path, and
        // renders are public `upload` assets, so anyone who strips the
        // transformation out of it gets the clean original (see
        // `watermarkedUrl` in src/lib/cloudinary.ts).
        ...(mediaId ? {} : { cleanImageUrl: cleanUrl, publicId }),
        // Id of the media row the server wrote, null when it did not.
        mediaId,
        // What the client should render right now.
        imageUrl,
        // How it was made. `dress_venue` tells the panel to show the
        // before/after slider before the design refetch lands.
        mode,
        text: result.text,
        // True iff the visitor is currently on the free tier, the UI
        // mounts the email gate when this is set.
        watermarked: isFreePack(pack.sku),
        // SKU on the active pack at the time of render. Lets the
        // client distinguish "free render, awaiting email" from "paid
        // render, no gate".
        packSku: pack.sku,
      };
    }),

  /**
   * F3, "Before we render": read the couple's brief with the cheap design
   * LLM before they spend a render on it, see src/server/ai/intake.ts.
   *
   * Anonymous sessions may call it (the generate step comes before the
   * email gate), so it is limited per user AND per IP: a bot minting fresh
   * anonymous users still shares one IP bucket. A mutation, not a query:
   * it costs money on every call, and the client decides when to ask.
   */
  checkIntake: protectedProcedure
    .input(
      z.object({
        eventType: z.enum([
          "wedding",
          "engagement",
          "birthday",
          "corporate",
          "other",
        ]),
        setting: z.enum(["indoor", "outdoor", "tent"]),
        guestCount: z.number().int().min(2).max(10000).nullish(),
        // As lenient as `renderScene`'s: a check refused over a long
        // palette name would only make the card disappear for nothing.
        palette: z.object({
          name: z.string().max(500).optional(),
          colors: z.array(z.string().max(100)).max(8).default([]),
        }),
        styleNotes: z.string().max(2000).optional(),
        references: z
          .array(
            z.object({
              url: z.string().min(1).max(2000),
              category: referenceCategorySchema,
            }),
          )
          .max(10),
        hasVenuePhoto: z.boolean(),
        locale: z.enum(locales).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Kill switch, checked here as well as in the UI: this is the check
      // that stops the spend the moment the flag flips.
      if (!isFlagEnabled("intakeCheck")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "INTAKE_DISABLED",
        });
      }
      const limited = "Too many checks for now. Please try again later.";
      await enforceTrpc("aiIntake", ctx.user.id, limited);
      const ip = ctx.req ? ipFromRequest(ctx.req) : "unknown";
      await enforceTrpc("aiIntake", `ip:${ip}`, limited);

      const locale = requestLocale(ctx.req, input.locale);
      let result: IntakeResult;
      try {
        result = await checkIntake({
          eventType: input.eventType,
          setting: input.setting,
          guestCount: input.guestCount ?? null,
          palette: input.palette,
          styleNotes: input.styleNotes ?? "",
          references: input.references,
          hasVenuePhoto: input.hasVenuePhoto,
          venuePhotoEnabled: isFlagEnabled("venuePhoto"),
          locale,
        });
      } catch (err) {
        reportError("ai.intake_failed", err, {
          userId: ctx.user.id,
          referenceCount: input.references.length,
          locale,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "INTAKE_FAILED",
        });
      }

      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_INTAKE_CHECKED, {
        conflicts: result.conflicts.length,
        conflict_kinds: result.conflicts.map((c) => c.kind),
        venue_candidates: result.venueCandidateIndexes.length,
        notes_setting: result.notesSetting,
        setting: input.setting,
        has_notes: Boolean(input.styleNotes?.trim()),
        reference_count: input.references.length,
        has_venue_photo: input.hasVenuePhoto,
        locale,
      });
      return result;
    }),

  /**
   * F2, "Talk to your design": apply one change the couple typed to one of
   * their renders, and keep the result as a new version of it.
   *
   * The result is a `type: "render"` row whose `parent_id` is the version
   * it was changed from, so tier watermarking, thumbnails and the lookbook
   * treat it like any render, and a change of a dressed venue keeps its
   * before/after slider (the lineage walk in src/lib/venue-photo.ts).
   *
   * Money: the edit is reserved before either model is called and handed
   * back on every failure (a refused request, a failed image, a row that
   * would not save), so the couple only ever pays for a version they got.
   */
  refineRender: protectedProcedure
    .input(
      z.object({
        mediaId: z.string().uuid(),
        instruction: z.string().trim().min(1).max(REFINE_INSTRUCTION_MAX),
        // The UI's locale, for the confirmation line. Falls back to the
        // locale cookie, like every server-rendered page.
        locale: z.enum(locales).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Kill switch, checked here as well as in the UI because this is the
      // check that cannot lag a flag flip, and it runs before anything is
      // reserved or called.
      if (!isFlagEnabled("refineRender")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "REFINE_DISABLED",
        });
      }

      // Scoped to the caller in the query, and checked again on the row: a
      // foreign render is the same NOT_FOUND as a missing one, so a leaked
      // media id does not confirm that it exists.
      const base = await prisma.venueDesignMedia.findFirst({
        where: {
          id: input.mediaId,
          type: "render",
          design: { user_id: ctx.user.id },
        },
        select: {
          id: true,
          cloudinary_public_id: true,
          design: {
            select: {
              id: true,
              user_id: true,
              event_type: true,
              setting: true,
              palette: true,
              venue_photo: true,
            },
          },
        },
      });
      if (!base || base.design.user_id !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Render not found" });
      }
      const designId = base.design.id;

      // The model is handed a URL we build from the stored public id, and
      // only for our own renders. `saveMedia` stores whatever id a client
      // sends, so without this a crafted row could point the edit model at
      // any asset on the account.
      const basePublicId = base.cloudinary_public_id;
      if (!basePublicId || !basePublicId.startsWith(RENDERS_FOLDER)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "RENDER_NOT_REFINABLE",
        });
      }

      // An anonymous couple sees their render only through the email gate,
      // so talking to it comes after the gate too. Otherwise every bot
      // that reaches the free designer could spend three edits per
      // anonymous user.
      if (ctx.user.is_anonymous) {
        const profile = await prisma.profile.findUnique({
          where: { id: ctx.user.id },
          select: { free_render_email: true },
        });
        if (!profile?.free_render_email) {
          throw new TRPCError({ code: "FORBIDDEN", message: "EMAIL_REQUIRED" });
        }
      }

      // Same pack plumbing as a render. A couple whose free render is spent
      // still has an `active` free pack while its edits last, and
      // `requireActivePack` answers PACK_QUOTA_EDITS once they are gone,
      // before any model work starts.
      await ensureFreePack(ctx.user.id);
      const pack = await requireActivePack(ctx.user.id, "edit");
      await enforceTrpcMany(
        [
          {
            key: "aiEdit",
            message: "Change limit reached. Please try again in an hour.",
          },
          {
            key: "aiEditDaily",
            message: "Daily change limit reached. Please try again tomorrow.",
          },
        ],
        ctx.user.id,
      );
      const freeTier = isFreePack(pack.sku);
      if (freeTier) {
        // The per-user quota is 3; this catches fresh anonymous users
        // minted to get three more.
        const ip = ctx.req ? ipFromRequest(ctx.req) : "unknown";
        await enforceTrpc(
          "aiEditFreePerIp",
          ip,
          "Too many changes from this network today. Please try again tomorrow.",
        );
      }

      // Image 2, the couple's venue photo, only when this version descends
      // from dressing the photo the design holds now: the same rule as the
      // before/after slider. A prompt-only render gets no venue (asking the
      // model to make an imagined hall "match" a real one morphs it), and
      // neither does one whose photo was since replaced or removed.
      let venue: { url: string; publicId: string } | null = null;
      const photo = parseVenuePhoto(base.design.venue_photo);
      if (
        photo &&
        isFlagEnabled("venuePhoto") &&
        isOwnVenuePublicId(photo.publicId, ctx.user.id)
      ) {
        const rows = await prisma.venueDesignMedia.findMany({
          where: { design_id: designId, type: "render" },
          select: { id: true, parent_id: true, meta: true },
        });
        const lineage = rows.map((row) => {
          const meta = parseMediaMeta(row.meta);
          return {
            id: row.id,
            parent_id: row.parent_id,
            mode: meta?.mode ?? null,
            venuePublicId: meta?.venuePublicId ?? null,
          };
        });
        if (compareBeforePhoto(base.id, lineage, photo)) {
          venue = {
            url: venueModelInputUrl(photo.publicId),
            publicId: photo.publicId,
          };
        }
      }

      // The atomic gate. `requireActivePack` above is only a read; two
      // changes sent at once both pass it, and this is what holds.
      const reserved = await reserveEdit(pack.id);
      if (!reserved) {
        throw new TRPCError({ code: "FORBIDDEN", message: "PACK_QUOTA_EDITS" });
      }
      const logContext = {
        userId: ctx.user.id,
        designId,
        mediaId: base.id,
        packId: pack.id,
      };

      // Read the request (any language) into a precise English edit and a
      // confirmation in the couple's language. The read fails closed: an
      // answer we cannot use is a refusal (the couple can provoke one on
      // purpose), and only a text model we could not reach lets the raw
      // request go to the image model as typed, with no confirmation line,
      // and then only past a deterministic screen for the same rules.
      const locale = requestLocale(ctx.req, input.locale);
      let read: RefineNormalisation | null;
      try {
        read = await normaliseRefineInstruction({
          instruction: input.instruction,
          locale,
          context: {
            eventType: base.design.event_type,
            setting: base.design.setting,
            palette: paletteSummary(base.design.palette),
            hasVenue: venue !== null,
          },
        });
      } catch (err) {
        if (!(err instanceof RefineNormaliserUnavailable)) {
          // Not an outage, so a bug: nothing was read, nothing is drawn.
          await releaseEditQuietly(pack.id, logContext);
          reportError("ai.refine_normalise_crashed", err, logContext);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "REFINE_FAILED",
          });
        }
        reportError("ai.refine_normalise_failed", err, logContext);
        read = refineRequestLooksUnsafe(input.instruction)
          ? {
              allowed: false,
              reason: "Text model unavailable and the raw request trips the fallback screen.",
              malformed: false,
            }
          : null;
      }
      if (read && !read.allowed) {
        await releaseEditQuietly(pack.id, logContext);
        if (read.malformed) {
          // Refused all the same, but worth seeing: a model or schema
          // change that breaks every answer would otherwise look like a
          // run of couples asking for things we do not draw.
          reportError(
            "ai.refine_normalise_malformed",
            new Error(read.reason),
            logContext,
          );
        }
        // Why, for tuning the rules; never shown to the couple, whose UI
        // says "we can only change the decor" in their own language.
        logger.info("ai.refine_rejected", {
          ...logContext,
          reason: read.reason,
          malformed: read.malformed,
        });
        throw new TRPCError({ code: "BAD_REQUEST", message: "REFINE_REJECTED" });
      }
      const instructionEn = read ? read.instructionEn : input.instruction;
      const confirmation = read ? read.confirmation : null;
      const normalised = read !== null;

      let result: Awaited<ReturnType<typeof refineScene>>;
      try {
        result = await refineScene({
          baseUrl: renderModelInputUrl(basePublicId),
          venueUrl: venue?.url ?? null,
          instructionEn,
          eventType: base.design.event_type,
        });
      } catch (err) {
        await releaseEditQuietly(pack.id, logContext);
        reportError("ai.refine_failed", err, logContext);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "REFINE_FAILED",
        });
      }

      // The new version, under the one it was changed from. Unlike a
      // render, a change the server could not save is handed back: the
      // client has no fallback save for it, and a version that exists only
      // in one browser tab cannot be changed again, chosen or shared.
      const meta = {
        mode: "refine",
        model: result.model,
        ...(result.costUsd != null ? { costUsd: result.costUsd } : {}),
        instructionRaw: input.instruction,
        instructionEn,
        ...(confirmation ? { confirmation } : {}),
        ...(venue ? { venuePublicId: venue.publicId } : {}),
      } satisfies MediaMeta;
      let mediaId: string;
      try {
        const row = await prisma.venueDesignMedia.create({
          data: {
            design_id: designId,
            type: "render",
            url: result.imageUrl,
            cloudinary_public_id: result.publicId,
            parent_id: base.id,
            meta,
          },
          select: { id: true },
        });
        mediaId = row.id;
      } catch (err) {
        await releaseEditQuietly(pack.id, logContext);
        reportError("ai.refine_persist_failed", err, {
          ...logContext,
          publicId: result.publicId,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "REFINE_FAILED",
        });
      }
      // "My designs" is ordered by updated_at. Cosmetic, so a failure here
      // does not undo a change the couple already has.
      await prisma.venueDesign
        .update({
          where: { id: designId },
          data: { updated_at: new Date() },
          select: { id: true },
        })
        .catch((err: unknown) =>
          reportError("ai.refine_touch_failed", err, logContext),
        );

      // From the pack as read before the reservation. Two changes landing
      // at once can each report one too many; the client refetches the pack
      // after every change, and the reservation itself is exact.
      const editsLeft = Math.max(0, pack.edits_quota - pack.edits_used - 1);
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_REFINED, {
        sku: pack.sku,
        edits_left: editsLeft,
        pack_id: pack.id,
        design_id: designId,
        media_id: mediaId,
        parent_id: base.id,
        has_venue: venue !== null,
        normalised,
        locale,
      });

      return {
        mediaId,
        parentId: base.id,
        // Tier-aware like a render: free sees the watermark, paid the clean
        // asset. The row stores the clean URL either way.
        imageUrl:
          freeTier && result.publicId
            ? watermarkedUrl(result.publicId)
            : result.imageUrl,
        confirmation,
        editsLeft,
      };
    }),

  startVideo: protectedProcedure
    .input(
      z.object({
        // Misnamed: the client only ever hands us the Cloudinary URL of
        // the render it is currently looking at, never a base64 payload.
        // The old `min(100)` was a leftover base64 length floor, and a
        // real render URL cleared it by exactly one character
        // (27 + cloud name + 14 + version + "zaffa-renders/" + public id
        // + ".png" = 100). A shorter cloud name or folder, or the
        // provider-passthrough branch in `mirrorToCloudinary`, would have
        // tripped it and painted a raw Zod string into the video CTA.
        // `.url()` is what the rest of src/server/routers uses for these
        // same URLs (see `venueDesigns.saveMedia`); `.max(2000)` mirrors
        // the `turnstileToken` bound above and leaves room for the long
        // signed watermarked variant. The field itself still needs
        // renaming to `imageUrl` - that spans video-generator.ts and
        // GenerateRenderPanel.tsx, so it is a separate change.
        imageBase64: z.string().url().max(2000),
        context: z
          .object({
            eventType: z.enum([
              "wedding",
              "engagement",
              "birthday",
              "corporate",
              "other",
            ]),
            setting: z.enum(["indoor", "outdoor", "tent"]),
            size: z.enum(["intimate", "medium", "large"]),
            guestCount: z.number().int().min(2).max(10000).nullish(),
            palette: z
              .object({
                name: z.string().optional(),
                colors: z.array(z.string()).max(8).default([]),
              })
              .optional(),
            styleNotes: z.string().max(2000).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Same paywall pattern as renders. Videos are the most expensive
      // generation surface, so the gate matters most here.
      const pack = await requireActivePack(ctx.user.id, "video");
      // Explicit SKU gate: the free tier's quota is 0, so
      // `requireActivePack(_, "video")` already throws PACK_QUOTA_VIDEOS,
      // but a dedicated tier check returns a more actionable error code
      // the UI can map to an "upgrade to unlock video" upsell.
      if (!packAllowsVideo(pack.sku)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "PACK_TIER_NO_VIDEO",
        });
      }
      await enforceTrpcMany(
        [
          {
            key: "aiVideo",
            message:
              "Video render limit reached. Please try again in an hour.",
          },
          {
            key: "aiVideoDaily",
            message:
              "Daily video render limit reached. Try again tomorrow or contact support to lift the cap.",
          },
        ],
        ctx.user.id,
      );
      const result = await startVideoGeneration(input);
      await consumeQuota(pack.id, "video");
      // Fired on the start of generation - completion is async/polled,
      // and the user-perceived moment of "I asked for a video" is here.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_VIDEO_GENERATED, {
        event_type: input.context?.eventType ?? null,
        setting: input.context?.setting ?? null,
        pack_id: pack.id,
      });
      return result;
    }),

  videoStatus: protectedProcedure
    .input(z.object({ generationId: z.string() }))
    .query(async ({ input }) => {
      return getVideoStatus(input.generationId);
    }),
});
