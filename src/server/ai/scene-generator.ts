import { generateImage } from "./image-gen";

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

function buildPrompt(
  input: RenderSceneInput,
  ordered: RenderReference[]
): string {
  const settingInfo =
    SETTING_DESCRIPTOR[input.setting] ?? SETTING_DESCRIPTOR.indoor;
  const layout =
    typeof input.guestCount === "number" && input.guestCount > 0
      ? describeLayoutForGuests(input.guestCount)
      : SIZE_LAYOUT[input.size] ?? SIZE_LAYOUT.medium;

  const palettePart = input.palette.colors.length
    ? `Color palette: ${input.palette.colors.join(", ")}${
        input.palette.name ? ` (${input.palette.name})` : ""
      }. Apply this palette across linens, florals, candles, lighting tone, and decor accents — every surface should feel coordinated, not arbitrary.`
    : "Choose a tasteful, coherent palette inspired by the references and apply it consistently across linens, florals, and decor.";

  const grouped: Record<ReferenceCategory, number[]> = {
    overall_vibe: [],
    tables: [],
    flowers: [],
    lighting: [],
    venue_decor: [],
  };
  ordered.forEach((ref, i) => {
    grouped[ref.category].push(i + 1);
  });

  const refLines = (Object.keys(grouped) as ReferenceCategory[])
    .filter((c) => grouped[c].length > 0)
    .map((c) => {
      const idxs = grouped[c];
      const label = idxs.length > 1 ? `Images ${idxs.join(", ")}` : `Image ${idxs[0]}`;
      return `- ${label}: ${CATEGORY_LABEL[c]}.`;
    })
    .join("\n");

  const notesPart = input.styleNotes?.trim()
    ? `Additional notes from the host (incorporate where they fit): ${input.styleNotes.trim()}`
    : "";

  return [
    `Generate a single photorealistic photograph, 16:9 widescreen landscape orientation, of a fully decorated and styled ${input.eventType} reception at ${settingInfo.space}. Layout: ${layout}.`,

    `Camera and composition: wide-angle lens (24-28mm equivalent), positioned at a slightly elevated standing height (approximately 2 meters off the ground), tilted gently downward in a three-quarter perspective. Far enough back to show the entire room or space in one frame, close enough that table settings, floral arrangements, place settings, and lighting fixtures all read clearly. Leading lines along the table runs draw the eye toward the focal point (sweetheart table, ceremony arch, or stage) in the middle ground. ${settingInfo.backdrop}.`,

    `Lighting and atmosphere: ${settingInfo.lighting}. Soft natural depth of field with the foreground tables in crisp focus and the far end of the venue gently softened. Editorial magazine-spread quality — clean, balanced, aspirational.`,

    palettePart,

    refLines
      ? `The host has provided the following inspiration images. Treat each one strictly as a stylistic mood reference for its category — adopt its colors, materials, textures, density, and mood for that part of the scene only. Do not paste, copy, reproduce them literally, or include them as cutouts. The output must be a single unified photograph of one venue, not a collage:\n${refLines}`
      : "",

    notesPart,

    `Important constraints: the venue is empty — NO people, NO guests, NO waitstaff anywhere in the frame. The composition must showcase the design itself. Avoid: text, captions, watermarks, logos, multiple panels, side-by-side comparisons, fisheye distortion, extreme top-down bird's-eye angles, miniature/tilt-shift effects, harsh flash, motion blur, low-resolution artifacts, oversaturated colors. Output exactly one photograph, no variations.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function renderScene(input: RenderSceneInput) {
  const ordered: RenderReference[] = [];
  const order: ReferenceCategory[] = [
    "overall_vibe",
    "tables",
    "flowers",
    "lighting",
    "venue_decor",
  ];
  for (const cat of order) {
    for (const ref of input.references.filter((r) => r.category === cat)) {
      if (ordered.length >= MAX_REFERENCES) break;
      ordered.push(ref);
    }
  }

  const prompt = buildPrompt(input, ordered);

  return generateImage({
    prompt,
    references: ordered.map((ref) => ({ url: ref.url })),
    cloudinaryFolder: "zaffa-renders",
  });
}
