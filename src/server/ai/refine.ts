// F2, "Talk to your design": a couple types what they would change under a
// render, in their own words and language, and gets a new version with only
// that changed.
//
// Two model calls per change:
//   1. `normaliseRefineInstruction`, a cheap text call on the design LLM
//      (~$0.001): reads the request in any language or dialect, refuses what
//      we will not draw (people, text, anything that is not decor), turns the
//      rest into one precise English edit, and writes the short confirmation
//      the couple sees, in their language.
//   2. `refineScene`, the edit image model (~$0.022): the current render is
//      Image 1 and is kept, only the one change is applied. When the render
//      dressed the couple's own venue photo, the photo rides along as Image 2
//      so a chain of edits cannot drift the real architecture.

import "server-only";
import { z } from "zod";
import { chatCompletionJson } from "@/server/llm/openrouter";
import type { Locale } from "@/i18n/config";
import { editImageModel, generateImageViaImagesApi } from "./image-gen";

/** Longest request the couple can type, and what the procedure accepts. */
export const REFINE_INSTRUCTION_MAX = 500;

// Plain quotes inside the change would close the «…» the prompt wraps it in.
function quoteSafe(text: string): string {
  return text.replace(/[«»]/g, '"').replace(/\s+/g, " ").trim();
}

/**
 * The edit prompt. Wording from the bake-off, where "change only this, keep
 * everything else" on `gpt-image-2.5-flare` added a dance floor and a
 * bigger floral stage and left the rest of the render alone.
 *
 * `hasVenue` is true only when the render descends from dressing the photo
 * the design holds now (see `ai.refineRender`). A prompt-only render gets no
 * Image 2: telling the model its imagined hall "must match" a real venue
 * would morph one into the other.
 */
export function buildRefinePrompt({
  instructionEn,
  hasVenue,
  eventType = "wedding",
}: {
  instructionEn: string;
  hasVenue: boolean;
  eventType?: string;
}): string {
  const article = /^[aeiou]/i.test(eventType) ? "an" : "a";
  return [
    `Image 1 is the current design of ${article} ${eventType} reception. Apply ONLY this change: «${quoteSafe(instructionEn)}».`,

    `Keep everything else identical: layout, camera position, framing, architecture, palette, furniture, florals, lighting. Whatever the change does not name stays exactly as it is in Image 1, in the same place and at the same size.`,

    hasVenue
      ? `Image 2 is the original photo of the real venue: permanent architecture and landscape (walls, ceiling, columns, windows, floor, trees, palms, lawn, hedges, horizon) must still match it.`
      : "",

    `No people, no text, no lettering, no watermark or logo. Output exactly one photograph.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Apply one normalised change to a render. `baseUrl` and `venueUrl` must be
 * built on the server from stored public ids (see `ai.refineRender`), never
 * taken from the client: the model fetches whatever it is handed.
 */
export async function refineScene({
  baseUrl,
  venueUrl,
  instructionEn,
  eventType,
}: {
  baseUrl: string;
  venueUrl: string | null;
  instructionEn: string;
  eventType?: string;
}) {
  const prompt = buildRefinePrompt({
    instructionEn,
    hasVenue: venueUrl !== null,
    eventType,
  });
  const { model, quality } = editImageModel();
  return generateImageViaImagesApi({
    model,
    quality,
    prompt,
    references: venueUrl
      ? [{ url: baseUrl }, { url: venueUrl }]
      : [{ url: baseUrl }],
    // Keep the render's own proportions, so versions line up in the strip
    // and a dressed venue still lines up with its photo in the slider.
    aspectRatio: "auto",
    cloudinaryFolder: "zaffa-renders",
    mode: "refine",
  });
}

// --- Instruction normalisation --------------------------------------------

const LOCALE_NAME: Record<Locale, string> = {
  en: "English",
  ar: "Arabic",
  fr: "French",
  de: "German",
};

// The confirmation opens the same way every time, so it reads as ours and
// not as a model's paragraph.
const CONFIRMATION_START: Record<Locale, string> = {
  en: "Done:",
  ar: "تمام،",
  fr: "C'est fait :",
  de: "Erledigt:",
};

const LOCALE_VOICE: Record<Locale, string> = {
  en: "Warm and plain, addressing the couple as you.",
  ar: "Warm Egyptian colloquial Arabic, addressing the couple in the plural (عايزين، ضفنالكم), with Latin digits.",
  fr: "Warm and plain, addressing the couple as vous.",
  de: "Warm and plain, addressing the couple as Sie.",
};

export interface RefineDesignContext {
  eventType: string;
  setting: string;
  /** Palette colours and name, when the design has one. */
  palette: string | null;
  /** The render dresses a photo of the couple's real venue. */
  hasVenue: boolean;
}

export type RefineNormalisation =
  | { allowed: true; instructionEn: string; confirmation: string | null }
  | { allowed: false; reason: string };

const REFINE_JSON_SCHEMA = {
  name: "refine_instruction",
  schema: {
    type: "object",
    properties: {
      allowed: { type: "boolean" },
      instructionEn: { type: "string" },
      confirmation: { type: "string" },
      reason: { type: "string" },
    },
    required: ["allowed", "instructionEn", "confirmation", "reason"],
    additionalProperties: false,
  },
} as const;

// Validated again after parsing: a provider that ignores `strict` must not
// slip a half-shaped answer through.
const normalisedSchema = z.object({
  allowed: z.boolean(),
  instructionEn: z.string(),
  confirmation: z.string(),
  reason: z.string().catch(""),
});

/** The copy rule (no em or en dashes), enforced on what the model wrote. */
function tidy(text: string): string {
  return text
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

const INSTRUCTION_EN_MAX = 600;
const CONFIRMATION_MAX = 200;

function systemPrompt(locale: Locale, hasVenue: boolean): string {
  return [
    `You turn a couple's request to change the render of their event decor into one instruction for an image editing model.`,

    `The couple typed the request themselves, in any language or dialect: Egyptian, Gulf or Levantine Arabic, Arabizi, French, German or English. Read it as a native speaker would.`,

    `Allowed: changes to the decor and styling of the event. Flowers and greenery, tables, chairs, linens, place settings, centrepieces, candles, lighting and its warmth or colour, the stage or kosha, arches, backdrops, draping, ceiling decor, the dance floor, the entrance, the colour palette, the layout and number of tables, the time of day and the sky.`,

    `Not allowed (allowed = false): adding, removing or changing people, faces or bodies, including the couple, guests, staff, performers and figures in pictures; any text, names, initials, lettering, signage wording, logos or brands; nudity or anything sexual; violence, weapons, drugs or anything hateful; anything that is not about decorating this event.`,

    hasVenue
      ? `This render dresses a photo of the couple's real venue. Changing its permanent structure (walls, ceiling, columns, windows, doors, floor, stairs, trees, palms, lawn, hedges, the view) is not allowed, because the venue is real; only what is added to it can change.`
      : "",

    `When allowed, instructionEn is one precise English instruction in the imperative, under 300 characters, naming what changes and where, and nothing else. Keep the couple's intent and do not add ideas they did not ask for. Make a vague request ("make it nicer") concrete in the spirit of the design.`,

    `confirmation is one short sentence under 120 characters in ${LOCALE_NAME[locale]}, telling the couple what was changed as if it is already done. Start it with "${CONFIRMATION_START[locale]}". Voice: ${LOCALE_VOICE[locale]}`,

    `Never use em dashes or en dashes. When not allowed, instructionEn and confirmation are empty strings and reason is a short English reason for our logs; when allowed, reason is an empty string.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Read the couple's request. Throws when the model call fails or answers
 * nonsense; the caller then falls back to the raw request with no
 * confirmation, so a flaky text model never costs the couple their change.
 */
export async function normaliseRefineInstruction({
  instruction,
  locale,
  context,
}: {
  instruction: string;
  locale: Locale;
  context: RefineDesignContext;
}): Promise<RefineNormalisation> {
  const design = [
    `Design: a ${context.eventType} reception, ${context.setting}.`,
    context.palette ? `Palette: ${context.palette}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const raw = await chatCompletionJson<unknown>({
    messages: [
      { role: "system", content: systemPrompt(locale, context.hasVenue) },
      {
        role: "user",
        content: `${design}\n\nThe couple's request: «${quoteSafe(instruction)}»`,
      },
    ],
    jsonSchema: REFINE_JSON_SCHEMA,
    temperature: 0.2,
    maxTokens: 400,
    appTitle: "Zaffa Refine",
    // The image call behind it takes ~40s; a hung text model should fall
    // back to the raw request quickly rather than add to that.
    timeoutMs: 20_000,
  });

  const parsed = normalisedSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Refine normaliser returned an unexpected shape");
  }
  if (!parsed.data.allowed) {
    return { allowed: false, reason: tidy(parsed.data.reason).slice(0, 300) };
  }
  const instructionEn = tidy(parsed.data.instructionEn);
  if (!instructionEn || instructionEn.length > INSTRUCTION_EN_MAX) {
    throw new Error("Refine normaliser returned no usable instruction");
  }
  const confirmation = tidy(parsed.data.confirmation);
  return {
    allowed: true,
    instructionEn,
    confirmation:
      confirmation && confirmation.length <= CONFIRMATION_MAX
        ? confirmation
        : null,
  };
}
