import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { printSizedUrl } from "@/lib/cloudinary";
import { chatCompletionJson, designLlmModel } from "@/server/llm/openrouter";
import {
  CANDLE_DENSITIES,
  CENTERPIECE_STYLES,
  CHAIR_STYLES,
  FLORAL_DENSITIES,
  FLOWER_KINDS,
  LINEN_STYLES,
  MAX_DECOR_QUESTIONS,
  TABLE_SHAPES,
  decorAnalysisSchema,
  withStoredDecor,
  type DecorAnalysis,
  type StoredDecor,
} from "@/lib/decor-analysis";

/**
 * F4: read a render into the fixed decor vocabulary the costed plan prices.
 *
 * One cheap vision call (~$0.0007 on DESIGN_LLM_MODEL) per render, ever: the
 * result is cached on the media row, and quantities and prices are computed
 * from it by `computeDecorPlan` on every read. The model is asked WHAT is in
 * the picture, never how much of it or what it costs; strict `json_schema`
 * output means it cannot answer with a key or value we did not declare.
 */

/** Strict JSON schema for the model; mirrors `decorAnalysisSchema`. */
export const DECOR_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "table_shape",
    "centerpiece",
    "has_stage",
    "has_arch",
    "has_entrance_decor",
    "has_dance_floor",
    "has_draping",
    "has_chandeliers",
    "has_string_lights",
    "candle_density",
    "floral_density",
    "flowers",
    "linens",
    "chair_style",
    "questions",
  ],
  properties: {
    table_shape: { type: "string", enum: [...TABLE_SHAPES] },
    centerpiece: { type: "string", enum: [...CENTERPIECE_STYLES] },
    has_stage: { type: "boolean" },
    has_arch: { type: "boolean" },
    has_entrance_decor: { type: "boolean" },
    has_dance_floor: { type: "boolean" },
    has_draping: { type: "boolean" },
    has_chandeliers: { type: "boolean" },
    has_string_lights: { type: "boolean" },
    candle_density: { type: "string", enum: [...CANDLE_DENSITIES] },
    floral_density: { type: "string", enum: [...FLORAL_DENSITIES] },
    flowers: {
      type: "array",
      items: { type: "string", enum: [...FLOWER_KINDS] },
    },
    linens: { type: "string", enum: [...LINEN_STYLES] },
    chair_style: { type: "string", enum: [...CHAIR_STYLES] },
    questions: { type: "array", items: { type: "string" } },
  },
} as const;

// The plan is a money surface, so Arabic here is neutral فصحى with Latin
// digits, not the Egyptian colloquial of the designer (plan section 6).
const QUESTION_LANGUAGE: Record<string, string> = {
  en: "English",
  ar: "Arabic: warm, neutral Modern Standard Arabic (فصحى), not a dialect, Latin digits for any number, addressing the couple in the plural",
  fr: "French, addressing the couple as vous",
  de: "German, addressing the couple as Sie",
};

function systemPrompt(locale: string): string {
  const language = QUESTION_LANGUAGE[locale] ?? QUESTION_LANGUAGE.en;
  return `You look at one photorealistic render of a wedding or event reception and report which decor is VISIBLE in it, using only the allowed values.

You never estimate quantities, sizes, areas or prices. Code does that from the guest count. Describe only what you can see.

Field guide:
- table_shape: "long" for banquet or family-style rows, "round" for round tables, "mixed" when both are clearly present.
- centerpiece: the arrangements on the guest tables. "low" sits below eye level, "tall" rises above the guests' heads (on stands or tall vases), "mixed" when both, "none" when tables are bare of arrangements.
- has_stage: a raised stage, kosha, or a decorated backdrop where the couple sits.
- has_arch: a floral or structural arch or arbour (ceremony arch).
- has_entrance_decor: a decorated entrance, aisle or walkway.
- has_dance_floor: a distinct dance floor surface.
- has_draping: fabric draped from the ceiling or on the walls.
- has_chandeliers: hanging chandeliers.
- has_string_lights: fairy lights, string lights or festoon bulbs.
- candle_density: "none", "some" (a few per table) or "lots" (candles everywhere).
- floral_density: "light", "medium" or "lush" across the whole scene.
- flowers: every flower type you can recognise, from the allowed list; "greenery" for foliage; "other" for anything else. Empty if there are no flowers.
- linens: "floor_length" tablecloths, "runner_only" (runners on bare tables) or "bare".
- chair_style: "chiavari" (slim gold or wooden ballroom chairs), "cross_back", "ghost" (clear acrylic) or "other".
- questions: 3 to 5 short, concrete questions this couple should ask a decorator to build exactly this design (materials, real versus silk flowers, what the venue already includes, setup and teardown time, how the lighting is achieved). Each under 140 characters. Write them in ${language}. Never mention prices, amounts or brands.

Never use an em dash or en dash in any text. Use a comma, a full stop, or a plain hyphen.`;
}

/** Long dashes read as machine-written; the copy rules forbid them. */
function cleanQuestion(q: string): string {
  return q
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export interface AnalyzeRenderContext {
  /** The couple's UI locale; the questions come back in it. */
  locale: string;
  /** The setting the couple chose, a hint for ambiguous renders. */
  setting?: string | null;
  timeoutMs?: number;
}

/**
 * Ask the design LLM what decor a render shows. Throws on a transport
 * failure or an answer that does not fit the schema; callers report and
 * degrade (the plan panel hides, the lookbook skips its page).
 */
export async function analyzeRender(
  imageUrl: string,
  ctx: AnalyzeRenderContext,
): Promise<DecorAnalysis> {
  const raw = await chatCompletionJson<unknown>({
    model: designLlmModel(),
    temperature: 0.2,
    maxTokens: 800,
    appTitle: "Zaffa decor plan",
    timeoutMs: ctx.timeoutMs,
    jsonSchema: { name: "decor_analysis", schema: DECOR_ANALYSIS_JSON_SCHEMA },
    messages: [
      { role: "system", content: systemPrompt(ctx.locale) },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `The couple chose this setting: ${ctx.setting ?? "unknown"}. Report the decor visible in this render.`,
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  // Questions are trimmed before validation, so an over-eager model that
  // writes seven gets its first five rather than a failed plan.
  const candidate =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const questions = Array.isArray(candidate.questions)
    ? [
        ...new Set(
          candidate.questions
            .filter((q): q is string => typeof q === "string")
            .map(cleanQuestion)
            .filter(Boolean),
        ),
      ].slice(0, MAX_DECOR_QUESTIONS)
    : [];
  return decorAnalysisSchema.parse({ ...candidate, questions });
}

/**
 * The image we show the model: the clean render at 1024px when we own it on
 * Cloudinary (never the watermarked tier URL, the mark is noise to a vision
 * model), else the stored URL.
 */
export function analysisImageUrl(media: {
  url: string;
  cloudinary_public_id: string | null;
}): string {
  return media.cloudinary_public_id
    ? printSizedUrl(media.cloudinary_public_id, 1024)
    : media.url;
}

/**
 * Analyse a render and cache the result on its media row, keeping every
 * other meta key. The write is best-effort from the caller's point of view:
 * the analysis is returned even if the cache write fails, and the caller
 * reports that separately.
 */
export async function analyzeAndStoreDecor(
  media: { id: string; url: string; cloudinary_public_id: string | null; meta: unknown },
  ctx: AnalyzeRenderContext,
): Promise<{ decor: StoredDecor; stored: boolean; error?: unknown }> {
  const analysis = await analyzeRender(analysisImageUrl(media), ctx);
  const decor: StoredDecor = {
    ...analysis,
    locale: ctx.locale,
    analyzedAt: new Date().toISOString(),
    model: designLlmModel(),
  };
  try {
    await prisma.venueDesignMedia.update({
      where: { id: media.id },
      data: {
        meta: withStoredDecor(media.meta, decor) as Prisma.InputJsonValue,
      },
    });
    return { decor, stored: true };
  } catch (error) {
    return { decor, stored: false, error };
  }
}
