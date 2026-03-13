import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  generateStyleRecommendations,
  generateStepAdvice,
  generatePaletteSuggestions,
  type VisualQuizSelections,
} from "../ai/style-quiz";
import { generateColorPalette } from "../ai/color-matching";
import { generateMoodBoard, visualizeVenue, refineVisualization } from "../ai/mood-board";
import { getRecommendations } from "../ai/recommendations";
import { generateScene, renderScene } from "../ai/scene-generator";
import { startVideoGeneration, getVideoStatus } from "../ai/video-generator";

const visualSelectionsSchema = z.object({
  vibe: z.array(z.string()).optional(),
  palette: z.array(z.string()).optional(),
  flower_types: z.array(z.string()).optional(),
  bouquet: z.array(z.string()).optional(),
  table_florals: z.array(z.string()).optional(),
  ceremony_flowers: z.array(z.string()).optional(),
  table_style: z.array(z.string()).optional(),
  table_centerpiece: z.array(z.string()).optional(),
  lighting: z.array(z.string()).optional(),
  venue_decor: z.array(z.string()).optional(),
});

export const aiRouter = router({
  styleQuiz: protectedProcedure
    .input(z.object({ selections: visualSelectionsSchema }))
    .mutation(async ({ input }) => {
      return generateStyleRecommendations(input.selections as VisualQuizSelections);
    }),

  stepAdvice: protectedProcedure
    .input(
      z.object({
        currentCategory: z.string(),
        selectionsSoFar: visualSelectionsSchema,
      })
    )
    .mutation(async ({ input }) => {
      return generateStepAdvice(
        input.currentCategory,
        input.selectionsSoFar as VisualQuizSelections
      );
    }),

  paletteSuggestions: protectedProcedure
    .input(z.object({ vibe: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      return generatePaletteSuggestions(input.vibe);
    }),

  colorPalette: protectedProcedure
    .input(
      z.object({
        preferences: z.object({
          mood: z.string(),
          season: z.string().optional(),
          colors: z.array(z.string()).optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      return generateColorPalette(input.preferences);
    }),

  moodBoard: protectedProcedure
    .input(
      z.object({
        style: z.string(),
        colors: z.array(z.string()).optional(),
        eventType: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return generateMoodBoard(input);
    }),

  visualizeVenue: protectedProcedure
    .input(
      z.object({
        venueImages: z.array(z.string()).min(1).max(4),
        style: z.string(),
        colors: z.array(z.string()).optional(),
        eventType: z.string(),
        additionalNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return visualizeVenue(input);
    }),

  refineVisualization: protectedProcedure
    .input(
      z.object({
        previousResponseId: z.string(),
        instruction: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      return refineVisualization(input.previousResponseId, input.instruction);
    }),

  recommendations: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        type: z.enum(["planner", "vendor"]),
      })
    )
    .query(async ({ ctx, input }) => {
      return getRecommendations(ctx.supabase, input.eventId, input.type);
    }),

  generateScene: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(5).max(2000),
        venueWidth: z.number().min(5).max(100),
        venueLength: z.number().min(5).max(100),
      })
    )
    .mutation(async ({ input }) => {
      return generateScene(input);
    }),

  renderScene: protectedProcedure
    .input(
      z.object({
        screenshot: z.string().min(100),
        description: z.string().min(5).max(2000),
      })
    )
    .mutation(async ({ input }) => {
      return renderScene(input);
    }),

  startVideo: protectedProcedure
    .input(
      z.object({
        imageBase64: z.string().min(100),
        prompt: z.string().max(500).default(""),
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
