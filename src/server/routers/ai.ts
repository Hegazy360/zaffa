import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { renderScene } from "../ai/scene-generator";
import { startVideoGeneration, getVideoStatus } from "../ai/video-generator";

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
    .mutation(async ({ input }) => {
      return renderScene(input);
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
    .mutation(async ({ input }) => {
      return startVideoGeneration(input);
    }),

  videoStatus: protectedProcedure
    .input(z.object({ generationId: z.string() }))
    .query(async ({ input }) => {
      return getVideoStatus(input.generationId);
    }),
});
