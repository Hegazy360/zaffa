import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { renderScene } from "../ai/scene-generator";
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
  requireActivePack,
} from "./vision-packs";
import { isFreePack, packAllowsVideo } from "@/lib/vision-pack";
import { watermarkedUrl } from "@/lib/cloudinary";
import { verifyTurnstile } from "@/lib/turnstile";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/logger";
import type { MediaMeta } from "@/lib/design-media-meta";

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
      if (designId) {
        const owned = await prisma.venueDesign.findFirst({
          where: { id: designId, user_id: ctx.user.id },
          select: { id: true },
        });
        if (!owned) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Design not found" });
        }
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

      const result = await renderScene(input);
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
          mode: "generate" as const,
          model: result.model,
          ...(result.costUsd != null ? { costUsd: result.costUsd } : {}),
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
        mode: "generate",
        event_type: input.eventType,
        setting: input.setting,
        size: input.size,
        guest_count: input.guestCount ?? null,
        reference_count: input.references.length,
        pack_id: pack.id,
        sku: pack.sku,
        design_id: designId,
        persisted: mediaId !== null,
      });

      return {
        // The clean asset and its public id only go back when the server
        // did NOT write the row, for the old client flow that saves it
        // through `saveMedia`. Once the row exists the client has no use
        // for them, and handing a free-tier visitor the unwatermarked URL
        // (or the public id it is built from) made the watermark optional.
        ...(mediaId ? {} : { cleanImageUrl: cleanUrl, publicId }),
        // Id of the media row the server wrote, null when it did not.
        mediaId,
        // What the client should render right now.
        imageUrl,
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
