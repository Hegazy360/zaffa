// F3, "Before we render": one cheap text-and-vision read of the couple's
// brief before the render they may only get one of.
//
// The first real couples showed what goes wrong without it. One pasted notes
// for an outdoor secret garden with chandeliers in the trees and left the
// setting on its default, indoor, so their one free render was an indoor
// barn. Another uploaded two photos of their actual, empty lawn as "mood
// references" and got a generic meadow. Both were readable from what they
// had already given us.
//
// `checkIntake` asks the design LLM (~$0.001) for:
//  - a one or two sentence summary, in the couple's language, of what we
//    will create, so they can see it before they spend the render;
//  - a clean English brief from their own words (any dialect), which the
//    render prompt carries next to the raw notes;
//  - conflicts between what they chose and what they wrote or showed, each
//    with a fix the UI can apply in one tap;
//  - which references look like a photo of an empty real venue, so the UI
//    can offer to dress that photo instead of treating it as a mood board.
//
// The model only reads. What the UI offers to change is decided here, in
// code, from the model's answer (see `finaliseIntake`).

import "server-only";
import { z } from "zod";
import { chatCompletionJson, type ChatContentPart } from "@/server/llm/openrouter";
import { intakeThumbUrl } from "@/lib/cloudinary";
import { publicIdFromDeliveryUrl } from "@/lib/cloudinary-url";
import type { Locale } from "@/i18n/config";

export const INTAKE_SETTINGS = ["indoor", "outdoor", "tent"] as const;
export type IntakeSetting = (typeof INTAKE_SETTINGS)[number];

export const INTAKE_CONFLICT_KINDS = ["setting", "guest_count", "notes", "other"] as const;
export type IntakeConflictKind = (typeof INTAKE_CONFLICT_KINDS)[number];

export type NotesSetting = IntakeSetting | "unclear";

export interface IntakeReference {
  url: string;
  category: string;
}

export interface IntakeInput {
  eventType: string;
  setting: IntakeSetting;
  guestCount: number | null;
  palette: { name?: string; colors: string[] };
  styleNotes: string;
  /** In the order the render sends them; indexes refer to this list. */
  references: IntakeReference[];
  hasVenuePhoto: boolean;
  /** False when the venue photo feature is switched off: no candidates. */
  venuePhotoEnabled: boolean;
  locale: Locale;
}

export interface IntakeConflict {
  kind: IntakeConflictKind;
  /**
   * One sentence in the couple's language, or null for a conflict the
   * server added itself (see `finaliseIntake`), which the UI words.
   */
  message: string | null;
  /** Only on a `setting` conflict: what one tap switches the setting to. */
  suggestedSetting: IntakeSetting | null;
}

export interface IntakeResult {
  summary: string;
  briefEn: string;
  conflicts: IntakeConflict[];
  /** Indexes into `IntakeInput.references`. */
  venueCandidateIndexes: number[];
  notesSetting: NotesSetting;
}

/** The model answered, but with nothing we can show. */
export class IntakeUnreadable extends Error {
  constructor(reason: string) {
    super(`Intake answer unreadable: ${reason}`);
    this.name = "IntakeUnreadable";
  }
}

// --- Which reference images the model may see -----------------------------

const UNSPLASH_HOST = "images.unsplash.com";
const PINTEREST_HOST = "i.pinimg.com";

/**
 * The URL the model is handed for one reference, or null to leave it out.
 *
 * Only images on our own Cloudinary account (uploads and re-hosted pins,
 * sent as a signed 512px thumbnail built from the public id), Unsplash
 * (resized through its own parameters) and Pinterest's image CDN. The model
 * provider fetches whatever it is given, so an arbitrary URL from the
 * client would let anyone point our account at any address.
 */
export function intakeImageUrl(url: string): string | null {
  const publicId = publicIdFromDeliveryUrl(url, process.env.CLOUDINARY_CLOUD_NAME);
  if (publicId) return intakeThumbUrl(publicId);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.port) return null;
  if (parsed.hostname === UNSPLASH_HOST) {
    parsed.searchParams.set("w", "512");
    parsed.searchParams.set("fit", "max");
    parsed.searchParams.set("fm", "jpg");
    parsed.searchParams.set("q", "70");
    return parsed.toString();
  }
  if (parsed.hostname === PINTEREST_HOST) return parsed.toString();
  return null;
}

// --- The prompt ----------------------------------------------------------

const LOCALE_NAME: Record<Locale, string> = {
  en: "English",
  ar: "Arabic",
  fr: "French",
  de: "German",
};

const LOCALE_VOICE: Record<Locale, string> = {
  en: "Warm and plain, addressing the couple as you.",
  ar: "Warm Egyptian colloquial Arabic, addressing the couple in the plural (هنعملكم، اخترتوا، كاتبين), with Latin digits.",
  fr: "Warm and plain, addressing the couple as vous.",
  de: "Warm and plain, addressing the couple as Sie.",
};

/** Longest brief kept; the render input takes up to 1200 characters. */
export const INTAKE_BRIEF_MAX = 800;
const SUMMARY_MAX = 400;
const CONFLICT_MESSAGE_MAX = 240;
const MAX_CONFLICTS = 3;

function systemPrompt(input: IntakeInput): string {
  const lang = LOCALE_NAME[input.locale];
  return [
    `You read a couple's brief for the decor of their ${input.eventType} before an image model renders it, and check it for problems they would want to fix before they spend their render.`,

    `They chose an event type, a setting (indoor, outdoor or tent), a guest count, a palette, wrote free-text notes and added up to 10 reference images. The notes can be in any language or dialect: Egyptian, Gulf or Levantine Arabic, Arabizi, French, German or English, or pasted from another assistant. Read them as a native speaker would.`,

    `summary: one or two short sentences in ${lang} telling the couple what we will create for them, from all their choices (setting, guests, palette, notes, references). Concrete, no marketing words. Voice: ${LOCALE_VOICE[input.locale]}`,

    `briefEn: a clean English design brief for the image model, under 600 characters: what the couple asked for in their notes, translated and tidied, plus the look their references share. Decor, florals, lighting, tables, colours and mood only. Leave out where it takes place (indoor, outdoor, tent), because the setting decides that, and never add ideas they did not ask for. An empty string when they wrote no notes and added no references.`,

    `notesSetting: where the notes place the event: "indoor" (a hall, ballroom, restaurant, a room), "outdoor" (a garden, lawn, beach, open air, under the stars, among trees), "tent", or "unclear" when the notes do not say or there are none.`,

    `conflicts: real contradictions between what they chose and what they wrote or showed. Usually none; at most ${MAX_CONFLICTS}. kind "setting" when the notes or most references clearly describe a different setting than the one chosen, with suggestedSetting the setting they describe. kind "guest_count" when the notes name a clearly different number of guests than the guest count. kind "notes" when the notes contradict the palette or themselves. kind "other" for anything else that would clearly make the render miss what they want. message is one short sentence in ${lang}, same voice, naming both sides. suggestedSetting is "none" unless kind is "setting". Never a conflict for a taste, a missing detail, or anything you are unsure of.`,

    input.hasVenuePhoto
      ? `venueCandidateIndexes: always an empty list; the couple already added a photo of their venue.`
      : `venueCandidateIndexes: the index of each reference image that is a plain photo of a real, EMPTY or undecorated venue (a hall, a lawn, a garden, a rooftop), the kind of snapshot a couple takes on a venue visit, even with people measuring or chairs stacked. Not decorated inspiration, not a styled or professional event photo, not a render. Usually an empty list.`,

    `Never use em dashes or en dashes. Everything written for the couple is in ${lang}; briefEn is in English.`,
  ].join("\n\n");
}

function selectionsText(input: IntakeInput, sent: number[]): string {
  const palette = input.palette.colors.length
    ? `${input.palette.colors.slice(0, 8).join(", ")}${
        input.palette.name ? ` (${input.palette.name.slice(0, 80)})` : ""
      }`
    : "not chosen";
  const notes = input.styleNotes.trim();
  return [
    `Event type: ${input.eventType}.`,
    `Setting chosen: ${input.setting}.`,
    `Guest count: ${input.guestCount ?? "not given"}.`,
    `Palette: ${palette}.`,
    `Photo of their own venue already added: ${input.hasVenuePhoto ? "yes" : "no"}.`,
    notes ? `Their notes, as typed:\n«${notes.replace(/[«»]/g, '"')}»` : `Their notes: none.`,
    sent.length
      ? `Their ${sent.length} reference image(s) follow, each labelled with its index.`
      : `No reference images.`,
  ].join("\n");
}

const INTAKE_JSON_SCHEMA = {
  name: "intake_check",
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      briefEn: { type: "string" },
      notesSetting: { type: "string", enum: ["indoor", "outdoor", "tent", "unclear"] },
      conflicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...INTAKE_CONFLICT_KINDS] },
            message: { type: "string" },
            suggestedSetting: {
              type: "string",
              enum: ["indoor", "outdoor", "tent", "none"],
            },
          },
          required: ["kind", "message", "suggestedSetting"],
          additionalProperties: false,
        },
      },
      venueCandidateIndexes: { type: "array", items: { type: "integer" } },
    },
    required: ["summary", "briefEn", "notesSetting", "conflicts", "venueCandidateIndexes"],
    additionalProperties: false,
  },
} as const;

// Validated again after parsing, leniently per field: one odd conflict or
// index must not throw away a good summary.
const answerSchema = z.object({
  summary: z.string(),
  briefEn: z.string().catch(""),
  notesSetting: z.enum(["indoor", "outdoor", "tent", "unclear"]).catch("unclear"),
  conflicts: z.array(z.unknown()).catch([]),
  venueCandidateIndexes: z.array(z.unknown()).catch([]),
});

const conflictSchema = z.object({
  kind: z.enum(INTAKE_CONFLICT_KINDS),
  message: z.string(),
  suggestedSetting: z.enum(["indoor", "outdoor", "tent", "none"]).catch("none"),
});

export type IntakeAnswer = z.infer<typeof answerSchema>;

/** The copy rule (no em or en dashes), enforced on what the model wrote. */
function tidy(text: string): string {
  return text
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cut at a word boundary, so a long brief never ends mid-word. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}

/**
 * Turn the model's answer into what the UI may act on. The rules that
 * decide a one-tap change live here, not in the prompt:
 *
 *  - A setting conflict is added whenever the notes place the event
 *    somewhere other than the chosen setting, even if the model did not
 *    list it. That mismatch is the one that cost a real couple their free
 *    render, and a model that notices it in `notesSetting` but forgets it
 *    in `conflicts` must not hide it.
 *  - Only a setting conflict carries a suggested setting, never the one
 *    already chosen, and only one setting conflict is kept.
 *  - Venue candidates must be references the model was actually shown, and
 *    there are none when the couple already has a venue photo or the
 *    feature is off.
 */
export function finaliseIntake(
  answer: IntakeAnswer,
  input: IntakeInput,
  shownIndexes: readonly number[],
): IntakeResult {
  const summary = clip(tidy(answer.summary), SUMMARY_MAX);
  if (!summary) throw new IntakeUnreadable("empty summary");
  const briefEn = clip(tidy(answer.briefEn), INTAKE_BRIEF_MAX);
  const notesSetting: NotesSetting = input.styleNotes.trim()
    ? answer.notesSetting
    : "unclear";

  const conflicts: IntakeConflict[] = [];
  for (const raw of answer.conflicts) {
    const parsed = conflictSchema.safeParse(raw);
    if (!parsed.success) continue;
    const message = clip(tidy(parsed.data.message), CONFLICT_MESSAGE_MAX);
    if (!message) continue;
    if (parsed.data.kind === "setting") {
      if (conflicts.some((c) => c.kind === "setting")) continue;
      let suggested =
        parsed.data.suggestedSetting === "none" ? null : parsed.data.suggestedSetting;
      if (!suggested && notesSetting !== "unclear") suggested = notesSetting;
      if (suggested === input.setting) suggested = null;
      conflicts.push({ kind: "setting", message, suggestedSetting: suggested });
    } else {
      conflicts.push({ kind: parsed.data.kind, message, suggestedSetting: null });
    }
    if (conflicts.length >= MAX_CONFLICTS) break;
  }

  if (notesSetting !== "unclear" && notesSetting !== input.setting) {
    const setting = conflicts.find((c) => c.kind === "setting");
    if (!setting) {
      conflicts.unshift({ kind: "setting", message: null, suggestedSetting: notesSetting });
      if (conflicts.length > MAX_CONFLICTS) conflicts.pop();
    } else if (!setting.suggestedSetting) {
      setting.suggestedSetting = notesSetting;
    }
  }

  const shown = new Set(shownIndexes);
  const venueCandidateIndexes =
    input.hasVenuePhoto || !input.venuePhotoEnabled
      ? []
      : [
          ...new Set(
            answer.venueCandidateIndexes.filter(
              (i): i is number => typeof i === "number" && Number.isInteger(i) && shown.has(i),
            ),
          ),
        ].sort((a, b) => a - b);

  return { summary, briefEn, conflicts, venueCandidateIndexes, notesSetting };
}

/**
 * Read the couple's brief. Throws when the model could not be asked or its
 * answer is unusable; the caller reports it and the UI quietly drops the
 * card, because the check must never stand between a couple and their
 * render.
 */
export async function checkIntake(input: IntakeInput): Promise<IntakeResult> {
  const shown: number[] = [];
  const imageParts: ChatContentPart[] = [];
  input.references.forEach((ref, index) => {
    const url = intakeImageUrl(ref.url);
    if (!url) return;
    shown.push(index);
    imageParts.push(
      { type: "text", text: `Reference index ${index} (category: ${ref.category}):` },
      { type: "image_url", image_url: { url } },
    );
  });

  const raw = await chatCompletionJson<unknown>({
    messages: [
      { role: "system", content: systemPrompt(input) },
      {
        role: "user",
        content: [{ type: "text", text: selectionsText(input, shown) }, ...imageParts],
      },
    ],
    jsonSchema: INTAKE_JSON_SCHEMA,
    temperature: 0.2,
    maxTokens: 900,
    appTitle: "Zaffa Intake",
    // The couple is looking at the generate step while this runs; a slow
    // answer is worth less than none, and the card simply stays away.
    timeoutMs: 20_000,
  });
  const parsed = answerSchema.safeParse(raw);
  if (!parsed.success) throw new IntakeUnreadable("answer has the wrong shape");
  return finaliseIntake(parsed.data, input, shown);
}
