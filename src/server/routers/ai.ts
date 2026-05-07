import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { renderScene } from "../ai/scene-generator";
import { startVideoGeneration, getVideoStatus } from "../ai/video-generator";
import { enforceTrpcMany } from "@/lib/rate-limit";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { consumeQuota, requireActivePack } from "./vision-packs";

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
      })
    )
    .mutation(async ({ ctx, input }) => {
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
      const result = await renderScene(input);
      // Atomically decrement the quota. Done after a successful render
      // so a failed OpenAI call doesn't burn a slot from the pack.
      await consumeQuota(pack.id, "render");
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
      });
      return result;
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
