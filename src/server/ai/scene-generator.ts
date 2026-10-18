import {
  generateImage,
  generateImageViaImagesApi,
  venueImageModel,
} from "./image-gen";

export type ReferenceCategory =
  | "overall_vibe"
  | "tables"
  | "flowers"
  | "lighting"
  | "venue_decor";

const CATEGORY_LABEL: Record<ReferenceCategory, string> = {
  overall_vibe: "overall vibe and mood",
  tables: "table styling, linens, plates, chairs, and seating",
  flowers: "florals, greenery, density, and arrangement style",
  lighting: "lighting fixtures and ambient glow",
  venue_decor: "decor, signage, arches, and structural pieces",
};

const SETTING_DESCRIPTOR: Record<
  string,
  { space: string; lighting: string; backdrop: string }
> = {
  indoor: {
    space:
      "an enclosed reception hall with visible ceiling, walls, and architectural details",
    lighting:
      "warm chandelier and pendant lighting, candlelight on tables, soft fill from sconces; even, low-contrast exposure",
    backdrop:
      "the far wall, draping, or focal feature visible in the background",
  },
  outdoor: {
    space:
      "an open-air outdoor venue with sky and surrounding landscape visible",
    lighting:
      "late-afternoon golden-hour light, long warm shadows, soft sun flare, ambient bistro/string lights starting to glow",
    backdrop: "sky, foliage, or landscape feature visible behind the layout",
  },
  tent: {
    space:
      "a tented outdoor venue with the tent canopy, drapes, and structural beams clearly visible above",
    lighting:
      "warm pendant chandeliers, fairy lights woven through the canopy, candlelight on tables, soft golden tone",
    backdrop:
      "tent walls, draped fabric, or partially open sides revealing dusk landscape",
  },
};

const SIZE_LAYOUT: Record<string, string> = {
  intimate:
    "an intimate layout (about 30 guests) with 3-4 long tables or a few round tables and a single focal point",
  medium:
    "a medium layout (about 100 guests) with multiple round or long tables arranged across the space and a clear focal point",
  large:
    "a large layout (200+ guests) with many tables fanning out across the space, a wide aisle or central path, and a prominent focal point",
};

// When the host gave us a precise headcount, build a layout sentence that
// names the actual number rather than a bucket sample. Keeps the AI from
// generating a 30-table room when the couple expects 80 guests.
function describeLayoutForGuests(count: number): string {
  if (count <= 50) {
    return `an intimate layout sized for about ${count} guests, with a few long or round tables and a single clear focal point`;
  }
  if (count <= 150) {
    return `a layout sized for about ${count} guests, with multiple round or long tables arranged across the space and a clear focal point`;
  }
  if (count <= 300) {
    return `a sizable layout for about ${count} guests, with many tables fanning out across the space, a wide aisle or central path, and a prominent focal point`;
  }
  return `a grand layout for about ${count} guests, with extensive table coverage across a large space, broad aisles, and a striking, prominent focal point`;
}

export interface RenderReference {
  url: string;
  category: ReferenceCategory;
}

export interface RenderSceneInput {
  eventType: string;
  // Clean English brief from the intake check (F3), when there is one. Both
  // prompts carry it next to the raw notes: the notes may be dialect the
  // image model half reads, the brief may have lost a detail they typed.
  briefEn?: string | null;
  setting: string;
  size: string;
  // Optional precise expected guest count. When provided, the layout
  // sentence is built around the exact number; otherwise we fall back to
  // the coarse bucket described in SIZE_LAYOUT.
  guestCount?: number | null;
  palette: { name?: string; colors: string[] };
  references: RenderReference[];
  styleNotes?: string;
}

const MAX_REFERENCES = 10;

/**
 * Mood references a dress-venue render sends after the venue photo. The
 * Images API bills every input image as tokens, and past four the extra
 * references were adding cost, not direction (image-models research, 3B).
 */
export const MAX_DRESS_VENUE_MOOD_REFERENCES = 4;

const REFERENCE_ORDER: ReferenceCategory[] = [
  "overall_vibe",
  "tables",
  "flowers",
  "lighting",
  "venue_decor",
];

/** References in category order, capped at `max`. */
function orderReferences(
  references: RenderReference[],
  max: number,
): RenderReference[] {
  const ordered: RenderReference[] = [];
  for (const cat of REFERENCE_ORDER) {
    for (const ref of references.filter((r) => r.category === cat)) {
      if (ordered.length >= max) return ordered;
      ordered.push(ref);
    }
  }
  return ordered;
}

function layoutFor(input: RenderSceneInput): string {
  return typeof input.guestCount === "number" && input.guestCount > 0
    ? describeLayoutForGuests(input.guestCount)
    : SIZE_LAYOUT[input.size] ?? SIZE_LAYOUT.medium;
}

/**
 * The couple's own words for the prompt: the intake check's English brief
 * (F3) when there is one, then the notes exactly as typed. `notesLead` is
 * each prompt's own framing of the raw notes.
 */
function wordsPartFor(input: RenderSceneInput, notesLead: string): string {
  const brief = input.briefEn?.trim();
  const notes = input.styleNotes?.trim();
  return [
    brief ? `Design brief, normalised from the couple's own words: ${brief}` : "",
    notes ? `${notesLead}: ${notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function palettePartFor(input: RenderSceneInput): string {
  return input.palette.colors.length
    ? `Color palette: ${input.palette.colors.join(", ")}${
        input.palette.name ? ` (${input.palette.name})` : ""
      }. Apply this palette across linens, florals, candles, lighting tone, and decor accents - every surface should feel coordinated, not arbitrary.`
    : "Choose a tasteful, coherent palette inspired by the references and apply it consistently across linens, florals, and decor.";
}

/** `Image 2`, `Images 3, 4`: one line per category that has references. */
function referenceLines(
  ordered: RenderReference[],
  firstIndex: number,
): string {
  const grouped: Record<ReferenceCategory, number[]> = {
    overall_vibe: [],
    tables: [],
    flowers: [],
    lighting: [],
    venue_decor: [],
  };
  ordered.forEach((ref, i) => {
    grouped[ref.category].push(i + firstIndex);
  });
  return REFERENCE_ORDER.filter((c) => grouped[c].length > 0)
    .map((c) => {
      const idxs = grouped[c];
      const label = idxs.length > 1 ? `Images ${idxs.join(", ")}` : `Image ${idxs[0]}`;
      return `- ${label}: ${CATEGORY_LABEL[c]}.`;
    })
    .join("\n");
}

function buildPrompt(
  input: RenderSceneInput,
  ordered: RenderReference[]
): string {
  const settingInfo =
    SETTING_DESCRIPTOR[input.setting] ?? SETTING_DESCRIPTOR.indoor;
  const layout = layoutFor(input);
  const palettePart = palettePartFor(input);

  const refLines = referenceLines(ordered, 1);

  const notesPart = wordsPartFor(
    input,
    "Additional notes from the host (incorporate where they fit)",
  );

  return [
    `Generate a single photorealistic photograph, 16:9 widescreen landscape orientation, of a fully decorated and styled ${input.eventType} reception at ${settingInfo.space}. Layout: ${layout}.`,

    `Camera and composition: wide-angle lens (24-28mm equivalent), positioned at a slightly elevated standing height (approximately 2 meters off the ground), tilted gently downward in a three-quarter perspective. Far enough back to show the entire room or space in one frame, close enough that table settings, floral arrangements, place settings, and lighting fixtures all read clearly. Leading lines along the table runs draw the eye toward the focal point (sweetheart table, ceremony arch, or stage) in the middle ground. ${settingInfo.backdrop}.`,

    `Lighting and atmosphere: ${settingInfo.lighting}. Soft natural depth of field with the foreground tables in crisp focus and the far end of the venue gently softened. Editorial magazine-spread quality - clean, balanced, aspirational.`,

    palettePart,

    refLines
      ? `The host has provided the following inspiration images. Treat each one strictly as a stylistic mood reference for its category - adopt its colors, materials, textures, density, and mood for that part of the scene only. Do not paste, copy, reproduce them literally, or include them as cutouts. The output must be a single unified photograph of one venue, not a collage:\n${refLines}`
      : "",

    notesPart,

    `Important constraints: the venue is empty - NO people, NO guests, NO waitstaff anywhere in the frame. The composition must showcase the design itself. Avoid: text, captions, watermarks, logos, multiple panels, side-by-side comparisons, fisheye distortion, extreme top-down bird's-eye angles, miniature/tilt-shift effects, harsh flash, motion blur, low-resolution artifacts, oversaturated colors. Output exactly one photograph, no variations.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function renderScene(input: RenderSceneInput) {
  const ordered = orderReferences(input.references, MAX_REFERENCES);

  const prompt = buildPrompt(input, ordered);

  // Returns `{ imageUrl, publicId, text, model, costUsd }` - the caller
  // (`ai.renderScene` procedure) uses `publicId` to derive the tier-aware
  // response URL (watermarked for free tier, clean for paid tiers) and
  // stamps `model` / `costUsd` into the media row's provenance.
  return generateImage({
    prompt,
    references: ordered.map((ref) => ({ url: ref.url })),
    cloudinaryFolder: "zaffa-renders",
    mode: "generate",
  });
}

/**
 * The prompt for dressing the couple's own venue photo (F1).
 *
 * Image 1 is the canvas, not a mood board. The prompt-only render above
 * tells the model to treat every image "strictly as a stylistic mood
 * reference", which is exactly how the first couple who uploaded their
 * lawn got back a generic meadow. Here the photo is the scene: the model
 * keeps everything permanent and the camera exactly, clears temporary
 * clutter, and only adds decor. The substance of the wording is what held
 * the palms, hedge, ceiling and columns in place in the bake-off
 * (the design partner plan, section 2).
 *
 * Deliberately absent from `buildPrompt`'s blocks: the setting descriptor
 * (the photo already says hall or garden), the forced 16:9 frame and the
 * forced camera (both would fight the couple's own framing).
 */
export function buildDressVenuePrompt(
  input: RenderSceneInput,
  moodRefs: RenderReference[],
): string {
  const layout = layoutFor(input);
  const refLines = referenceLines(moodRefs, 2);

  return [
    `Image 1 is a photograph of the couple's real venue, the exact place their ${input.eventType} will happen. Edit this photograph: dress this same space for the ${input.eventType}. The result must be the same place, photographed from the same spot.`,

    `Keep every permanent element exactly as it is in Image 1: walls, ceiling, columns, arches, floor, stairs, doors, windows, trees, palms, lawn shape, hedges, flower beds, paths, the horizon and the skyline. Do not move, resize, remove, restyle or add any permanent structure or plant. Keep the camera position, height, lens, perspective and framing exactly the same, so the result lines up with Image 1 when laid over it.`,

    `Remove only temporary clutter: boxes, plastic chairs, bags, cleaning tools, cables and any people.`,

    `Add the decor, sized for the guest count. Layout: ${layout}. Place tables, chairs, linens, florals, lighting, draping and the focal piece (a stage for the couple, an arch or a sweetheart table) on the existing floor or lawn inside the visible area, at believable real-world scale for this space.`,

    palettePartFor(input),

    refLines
      ? `The couple added mood references for the decor only. Take colors, materials, textures, density and mood from each one for its part of the decor, but never copy their rooms, architecture, backgrounds or layouts into the venue, and never paste them in as cutouts:\n${refLines}`
      : "",

    wordsPartFor(
      input,
      "The couple's notes as they typed them (follow them for the decor; they may be written in any language)",
    ),

    `Lighting: keep the photo's own light, or make it a warm evening or golden-hour scene with the decor lighting glowing, whichever flatters the space. The permanent structures stay exactly as they are either way.`,

    `Important constraints: NO people, guests or staff anywhere in the frame. No text, captions, signage lettering, watermarks or logos. No collage, multiple panels or side-by-side comparison. Output exactly one photograph.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Dress the couple's venue photo (F1). `venue.url` must be built on the
 * server from the design's stored photo (see `ai.renderScene`), never
 * taken from the client. The venue goes first so it is Image 1; up to
 * `MAX_DRESS_VENUE_MOOD_REFERENCES` mood references follow in category
 * order. `aspectRatio: "auto"` keeps the photo's own proportions, which is
 * what lets the before/after slider line the two up.
 */
export async function dressVenueScene(
  input: RenderSceneInput,
  venue: { url: string },
) {
  const moods = orderReferences(input.references, MAX_DRESS_VENUE_MOOD_REFERENCES);
  const prompt = buildDressVenuePrompt(input, moods);
  const { model, quality } = venueImageModel();
  return generateImageViaImagesApi({
    model,
    quality,
    prompt,
    references: [{ url: venue.url }, ...moods.map((ref) => ({ url: ref.url }))],
    aspectRatio: "auto",
    cloudinaryFolder: "zaffa-renders",
    mode: "dress_venue",
  });
}
