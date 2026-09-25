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
import { LlmError, chatCompletionJson } from "@/server/llm/openrouter";
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
  | {
      allowed: false;
      /** For our logs, never for the couple. */
      reason: string;
      /**
       * The model answered, but not in a shape we accept (unreadable,
       * cut off, empty, or an instruction that breaks our own limits),
       * rather than refusing. Refused all the same: see
       * `normaliseRefineInstruction`.
       */
      malformed: boolean;
    };

/**
 * The text model could not be asked at all: the network, the timeout, or
 * OpenRouter answering with an error status. The only failure the caller
 * may fall back to the couple's raw words on, and only past
 * `refineRequestLooksUnsafe`.
 */
export class RefineNormaliserUnavailable extends Error {
  constructor(cause: unknown) {
    super(
      `Refine normaliser unavailable: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "RefineNormaliserUnavailable";
  }
}

// An outage, as opposed to an answer. 403 is OpenRouter's moderation
// refusing the request itself: the couple's words caused it, so it is not
// an outage and must not unlock the raw-words fallback. An empty answer
// is how a provider's safety block can come back, so it is not one either.
function isTextModelOutage(err: unknown): boolean {
  if (err instanceof LlmError) {
    if (err.kind === "http") return err.status !== 403;
    return err.kind === "envelope";
  }
  // `fetch` itself failed: undici's TypeError, or our AbortSignal timeout.
  if (err instanceof TypeError) return true;
  return (
    err instanceof Error &&
    (err.name === "TimeoutError" || err.name === "AbortError")
  );
}

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

function malformed(reason: string): RefineNormalisation {
  return { allowed: false, reason: reason.slice(0, 300), malformed: true };
}

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
 * Read the couple's request.
 *
 * Fails closed on anything the model said: an answer we cannot use
 * (unreadable or cut-off JSON, an empty reply, the wrong shape, an empty
 * or overlong instruction) comes back as a refusal with `malformed` set.
 * The couple writes the input, so they can steer the model into any of
 * these on purpose, and treating one as "use the raw words instead" would
 * hand the image model exactly the request the rules exist to stop.
 *
 * Throws `RefineNormaliserUnavailable` only when the model could not be
 * asked (see `isTextModelOutage`). A flaky provider then does not cost the
 * couple their change: the caller may send the raw words, once they pass
 * `refineRequestLooksUnsafe`.
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

  let raw: unknown;
  try {
    raw = await chatCompletionJson<unknown>({
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
  } catch (err) {
    if (isTextModelOutage(err)) throw new RefineNormaliserUnavailable(err);
    // JSON cut off at maxTokens, prose instead of JSON, or nothing at all.
    return malformed(
      `unreadable answer: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const parsed = normalisedSchema.safeParse(raw);
  if (!parsed.success) return malformed("answer has the wrong shape");
  if (!parsed.data.allowed) {
    return {
      allowed: false,
      reason: tidy(parsed.data.reason).slice(0, 300),
      malformed: false,
    };
  }
  const instructionEn = tidy(parsed.data.instructionEn);
  if (!instructionEn) return malformed("allowed with an empty instruction");
  if (instructionEn.length > INSTRUCTION_EN_MAX) {
    return malformed(
      `allowed with an instruction of ${instructionEn.length} characters`,
    );
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

// --- The fallback's own screen --------------------------------------------

// Whole words, lower case. English, French and German, plus the Arabizi a
// couple is likeliest to type. Exact words only: a prefix match would stop
// "texture", "personalised" and "surface" along with "text", "person" and
// "face". Words that are ordinary decor talk are left out on purpose:
// guests ("guest tables"), baby ("baby's breath", "baby blue"), face
// ("chairs face the stage"), family ("family-style tables"), blood
// ("blood red").
const UNSAFE_LATIN_WORDS = new Set([
  // People, faces, bodies.
  "bride", "brides", "groom", "grooms", "bridegroom", "newlyweds",
  "people", "person", "persons", "faces", "body", "bodies", "man", "men",
  "woman", "women", "girl", "girls", "boy", "boys", "child", "children",
  "kid", "kids", "dancer", "dancers", "singer", "singers", "musician",
  "musicians", "waiter", "waiters", "mom", "dad", "mother", "father",
  "portrait", "portraits", "selfie", "selfies",
  "mariée", "mariées", "marié", "mariés", "gens", "personne",
  "personnes", "visage", "visages", "corps", "homme", "hommes", "femme",
  "femmes", "enfant", "enfants", "danseur", "danseurs", "danseuse",
  "danseuses",
  "braut", "bräutigam", "brautpaar", "leute", "menschen", "personen",
  "gesicht", "gesichter", "mann", "männer", "frau", "frauen", "kinder",
  "tänzer", "tänzerin",
  "3aris", "3arees", "3ariis", "3arousa", "3aroosa", "3arosa", "3roosa",
  "3ersan", "naas",
  // Text, names, logos, brands.
  "text", "texts", "word", "words", "letter", "letters", "lettering",
  "name", "names", "initials", "monogram", "monograms", "sign", "signs",
  "signage", "write", "writes", "writing", "written", "wrote", "spell",
  "caption", "captions", "quote", "hashtag", "logo", "logos", "brand",
  "brands", "branded", "trademark",
  "texte", "textes", "mot", "mots", "lettre", "lettres", "nom", "noms",
  "prénom", "prénoms", "écrire", "écrit", "écrite", "écriture",
  "marque", "marques", "enseigne", "initiales",
  "wort", "wörter", "buchstabe", "buchstaben", "schrift", "schriftzug",
  "schreiben", "geschrieben", "namen", "marke", "marken", "initialen",
  "esm", "esmna", "esmena", "asamy", "asamina", "ektebo", "ektb",
  "maktoob",
  // Nudity, weapons.
  "nude", "naked", "nudity", "sexy", "sexual", "lingerie", "bikini",
  "topless", "nackt", "weapon", "weapons", "gun", "guns",
]);

// Arabic, in the folded spelling `foldArabic` produces. Stems match the
// start of a word once a leading و/ف/ب/ل/ك and ال are taken off, so
// "العروسة" and "بأسامينا" count while "مناسب" (suitable) does not trip
// "ناس" (people). Left out like their Latin twins: ضيف (also Egyptian
// for "add"), ضيوف and معازيم ("guest tables"), مسدس (also "hexagonal").
const UNSAFE_ARABIC_STEMS = [
  // People, faces, bodies.
  "عريس", "عروس", "عرسان", "ناس", "اشخاص", "وجوه", "رجاله", "رجال",
  "ستات", "سيدات", "بنات", "ولاد", "اولاد", "اطفال", "طفل", "عيال",
  "راقص", "رقاصه", "مطرب", "مغني", "جرسون",
  // Text, names, logos, brands.
  "اسمنا", "اسمي", "اسمه", "اسمها", "اسمهم", "اسمكم", "اسامي", "اسماء",
  "كلام", "كلمه", "كلمات", "كتابه", "كتب", "اكتب", "نكتب", "يكتب",
  "مكتوب", "حروف", "حرف", "لوجو", "لوغو", "لوقو", "شعار", "ماركه",
  "براند", "يافطه", "لافته", "هاشتاج", "مونوجرام",
  // Nudity, weapons.
  "عريان", "عاري", "سكسي", "بكيني", "سلاح",
];

// Whole words only: "اسم" as a stem would also stop "أسمر" (a brown tone).
const UNSAFE_ARABIC_WORDS = new Set(["اسم"]);

const ARABIC_PREFIXES = [
  "وبال", "وال", "بال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ل", "ك",
];

// One spelling per letter, so a stem matches however it was typed: the
// hamza forms of alef, taa marbuta, alef maqsura, tatweel and diacritics.
function foldArabic(word: string): string {
  return word
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function arabicWordIsUnsafe(word: string): boolean {
  const folded = foldArabic(word);
  const forms = [folded];
  for (const prefix of ARABIC_PREFIXES) {
    if (folded.startsWith(prefix) && folded.length > prefix.length + 1) {
      const rest = folded.slice(prefix.length);
      forms.push(rest);
      // و/ف/ب then ال: "والعروسة", "بالاسم".
      if (rest.startsWith("ال") && rest.length > 3) forms.push(rest.slice(2));
    }
  }
  return forms.some(
    (form) =>
      UNSAFE_ARABIC_WORDS.has(form) ||
      UNSAFE_ARABIC_STEMS.some((stem) => form.startsWith(stem)),
  );
}

/**
 * A crude, deterministic screen for the couple's raw words, used only
 * when the text model could not be asked and the raw words would go to
 * the image model as typed. True when the request mentions people, text,
 * names, logos, brands, nudity or weapons in a language we serve, or
 * quotes something (the usual shape of `write "Ahmed & Sara"`).
 *
 * It is deliberately blunt and errs towards refusing: on this path a false
 * refusal costs the couple nothing (the edit is handed back and they can
 * try again), and a miss draws what the model would have refused. The
 * model's rules stay the real ones.
 */
export function refineRequestLooksUnsafe(instruction: string): boolean {
  if (/["\u201C\u201D\u201E\u201F\u00AB\u00BB\u2033]/.test(instruction)) {
    return true;
  }
  const words = instruction
    .normalize("NFC")
    .toLocaleLowerCase("en")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
  return words.some((word) =>
    /\p{Script=Arabic}/u.test(word)
      ? arabicWordIsUnsafe(word)
      : UNSAFE_LATIN_WORDS.has(word),
  );
}
