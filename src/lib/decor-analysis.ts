// What a render shows, as a fixed vocabulary (F4, "What it takes to build
// this", the design partner plan).
//
// The design LLM looks at a render and answers ONLY in these enums. It never
// says how many of anything, how big, or what it costs: quantities come from
// the guest count by rules in `decor-pricing.ts`, and prices from a sourced
// table there. A model that can only pick "tall" or "low" cannot invent a
// 40,000 EGP centrepiece, and a couple on a money surface must never be shown
// a number a model made up.
//
// The analysis is cached on the render's media row as `meta.decor` (see
// `readStoredDecor`), so a guest-count change re-prices the plan for free.
//
// Importable from client and server: zod only, no Node or Prisma deps.

import { z } from "zod";

export const TABLE_SHAPES = ["long", "round", "mixed"] as const;
export const CENTERPIECE_STYLES = ["none", "low", "tall", "mixed"] as const;
export const CANDLE_DENSITIES = ["none", "some", "lots"] as const;
export const FLORAL_DENSITIES = ["light", "medium", "lush"] as const;
export const FLOWER_KINDS = [
  "rose",
  "hydrangea",
  "baby_breath",
  "peony",
  "orchid",
  "greenery",
  "other",
] as const;
export const LINEN_STYLES = ["floor_length", "runner_only", "bare"] as const;
export const CHAIR_STYLES = ["chiavari", "cross_back", "ghost", "other"] as const;

export type TableShape = (typeof TABLE_SHAPES)[number];
export type FlowerKind = (typeof FLOWER_KINDS)[number];
export type ChairStyle = (typeof CHAIR_STYLES)[number];

/** Most questions we keep; the prompt asks for 3 to 5. */
export const MAX_DECOR_QUESTIONS = 5;

export const decorAnalysisSchema = z.object({
  table_shape: z.enum(TABLE_SHAPES),
  centerpiece: z.enum(CENTERPIECE_STYLES),
  has_stage: z.boolean(),
  has_arch: z.boolean(),
  has_entrance_decor: z.boolean(),
  has_dance_floor: z.boolean(),
  has_draping: z.boolean(),
  has_chandeliers: z.boolean(),
  has_string_lights: z.boolean(),
  candle_density: z.enum(CANDLE_DENSITIES),
  floral_density: z.enum(FLORAL_DENSITIES),
  // Deduplicated on read: a model listing "rose" twice must not show it twice.
  flowers: z
    .array(z.enum(FLOWER_KINDS))
    .max(FLOWER_KINDS.length * 2)
    .transform((list) => [...new Set(list)]),
  linens: z.enum(LINEN_STYLES),
  chair_style: z.enum(CHAIR_STYLES),
  /** Short questions for a decorator, in the locale recorded next to them. */
  questions: z.array(z.string().max(300)).max(MAX_DECOR_QUESTIONS),
});

export type DecorAnalysis = z.infer<typeof decorAnalysisSchema>;

/**
 * The analysis as cached under `venue_design_media.meta.decor`. `locale` is
 * the language the questions were written in: a couple who switches
 * language gets the UI's own questions rather than a second paid call.
 */
export const storedDecorSchema = decorAnalysisSchema.extend({
  locale: z.string().min(2).max(8),
  analyzedAt: z.string(),
  model: z.string().optional().catch(undefined),
});

export type StoredDecor = z.infer<typeof storedDecorSchema>;

/**
 * Tolerant read of `meta.decor`. Never throws, returns null when the row has
 * no analysis or one this code cannot trust.
 *
 * Deliberately reads the raw JSON rather than going through
 * `parseMediaMeta`: a legacy render predates `meta.mode`, so its meta is
 * `{decor}` alone, and it must still get its cached plan back.
 */
export function readStoredDecor(metaJson: unknown): StoredDecor | null {
  try {
    if (!metaJson || typeof metaJson !== "object" || Array.isArray(metaJson)) {
      return null;
    }
    const parsed = storedDecorSchema.safeParse(
      (metaJson as Record<string, unknown>).decor,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The media row's meta with `decor` set, every other key kept. Legacy rows
 * with no meta at all get `{decor}` and no guessed `mode`.
 */
export function withStoredDecor(
  metaJson: unknown,
  decor: StoredDecor,
): Record<string, unknown> {
  const base =
    metaJson && typeof metaJson === "object" && !Array.isArray(metaJson)
      ? (metaJson as Record<string, unknown>)
      : {};
  return { ...base, decor };
}
