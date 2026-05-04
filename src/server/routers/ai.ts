import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { renderScene } from "../ai/scene-generator";
import { startVideoGeneration, getVideoStatus } from "../ai/video-generator";
import { enforceTrpcMany } from "@/lib/rate-limit";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

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
        palette: z.object({
          name: z.string().optional(),
          colors: z.array(z.string()).max(8).default([]),
        }),
        references: z.array(renderReferenceSchema).max(10),
        styleNotes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Per-hour burst cap + per-day cost ceiling. Keeps a single user
      // from running up the OpenAI bill if they leave the designer open.
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
      // Couple-journey funnel — every successful AI render is a step
      // toward a finished design. Tracking the input shape (event type,
      // setting, palette size) lets us compare conversion across config.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_RENDER_GENERATED, {
        event_type: input.eventType,
        setting: input.setting,
        size: input.size,
        reference_count: input.references.length,
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
      // Fired on the start of generation — completion is async/polled,
      // and the user-perceived moment of "I asked for a video" is here.
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_VIDEO_GENERATED, {
        event_type: input.context?.eventType ?? null,
        setting: input.context?.setting ?? null,
      });
      return result;
    }),

  videoStatus: protectedProcedure
    .input(z.object({ generationId: z.string() }))
    .query(async ({ input }) => {
      return getVideoStatus(input.generationId);
    }),
});
