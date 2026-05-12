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
        // Optional precise count — when present, the scene generator uses
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Bot protection on anonymous Generate. Verified BEFORE we mint
      // a free pack so a captcha failure can't burn a quota slot or
      // create stray DB rows. Paid users (`is_anonymous=false` and
      // already past the email gate at signup) are exempt — they've
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

      // Free-tier auto-grant: anonymous (or not-yet-paid) users hitting
      // generate get an `active` free pack created on the fly. Idempotent.
      await ensureFreePack(ctx.user.id);

      // Paywall gate: require an active Vision Pack with renders quota
      // remaining. Throws FORBIDDEN with a stable message string the UI
      // pattern-matches on (PACK_REQUIRED / PACK_QUOTA_RENDERS /
      // PACK_WINDOW_EXPIRED) to surface the right modal.
      const pack = await requireActivePack(ctx.user.id, "render");
      // Per-hour burst cap + per-day cost ceiling. Even on a paid pack
      // these stay — they're independent abuse protection (a single user
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
      // quota. Doesn't apply to paid packs — those users have already
      // committed.
      if (isFreePack(pack.sku)) {
        const ip = ctx.req ? ipFromRequest(ctx.req) : "unknown";
        await enforceTrpc(
          "aiRenderFreePerIp",
          ip,
          "Too many free renders from this network. Sign in or buy a pack to continue.",
        );
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
      // an upgrade the same row's `imageUrl` flips automatically — no
      // re-render required (see `venueDesigns.list` / `getById`).
      const imageUrl =
        isFreePack(pack.sku) && publicId
          ? watermarkedUrl(publicId)
          : cleanUrl;

      // Couple-journey funnel — every successful AI render is a step
      // toward a finished design. Tracking the input shape (event type,
      // setting, palette size) lets us compare conversion across config.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_RENDER_GENERATED, {
        event_type: input.eventType,
        setting: input.setting,
        size: input.size,
        guest_count: input.guestCount ?? null,
        reference_count: input.references.length,
        pack_id: pack.id,
        sku: pack.sku,
      });

      return {
        // Clean URL (server-side persistence) — kept on the returned
        // shape for the `venueDesigns.saveMedia` follow-up which stores
        // it in the DB so future paid views resolve directly.
        cleanImageUrl: cleanUrl,
        publicId,
        // What the client should render right now.
        imageUrl,
        text: result.text,
        // True iff the visitor is currently on the free tier — the UI
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
        imageBase64: z.string().min(100),
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
      // Fired on the start of generation — completion is async/polled,
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
