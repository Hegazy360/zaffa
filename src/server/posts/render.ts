// 4:5 portrait render generator for the post pipeline.
//
// Wraps the low-level `generateImage` helper with the post-specific
// prompt template:
//
//   editorial wedding photography, photoreal, [vibe],
//   color palette: [palette names + hex],
//   no faces, golden hour, magazine quality, 4:5 portrait
//
// The model itself ignores explicit aspect-ratio strings, but the
// "4:5 portrait" hint reliably nudges Gemini 3 Pro Image into a tall
// composition. The carousel slide then crops to a hard 4:5 frame
// regardless.

import { generateImage } from "@/server/ai/image-gen";
import type { NamedPalette } from "@/types/posts";

export interface RenderPostImageInput {
  vibe: string;
  palette: NamedPalette;
  /**
   * Optional reference URLs (typically the mirrored inspiration
   * images). 0-3 references gets the best balance, too many and the
   * model collages.
   */
  references?: string[];
  /**
   * Stylistic seed appended to the prompt so multiple calls in a single
   * post don't return near-identical variants. The pipeline passes a
   * different seed per render index.
   */
  variantSeed?: string;
}

function buildPostPrompt(input: RenderPostImageInput): string {
  const colorList = input.palette.colors
    .map((c) => `${c.name} ${c.hex}`)
    .join(", ");

  const variantHint = input.variantSeed
    ? `\n\nVariant focus for this render: ${input.variantSeed}.`
    : "";

  return [
    `Generate one ultra-high-resolution photorealistic editorial wedding photograph in 4:5 portrait orientation. Output the highest quality available - fine textile texture, individual petal detail, crisp candle highlights, no compression artifacts.`,

    `Subject: a fully decorated and styled wedding reception, empty of people, evoking the vibe "${input.vibe}". Frame as a single hero composition with a clear focal point (sweetheart table, ceremony arch, tablescape, or installation) and intentional negative space.`,

    `Color palette (apply across linens, florals, candles, lighting tone, and decor accents - every surface should feel coordinated, not arbitrary): ${colorList}.`,

    `Style: shot like a Vogue Weddings or Martha Stewart editorial spread - medium-format camera look, sharp foreground subject with shallow but tasteful depth of field, golden-hour or candlelit ambient warmth, true-to-life skin-tone-neutral white balance, subtle natural film grain, no oversaturation, no HDR halos.`,

    `Quality bar: tack-sharp focus on hero details, accurate floral species and textile drape, realistic shadow falloff, no plastic-looking AI artifacts on fabric or glassware.`,

    `Important constraints: no people, no faces, no guests, no waitstaff, no text, no captions, no watermarks, no logos. The composition must showcase the design itself in a single unified photograph - no collages, no side-by-side panels.${variantHint}`,
  ].join("\n\n");
}

export async function renderPostImage(input: RenderPostImageInput) {
  const prompt = buildPostPrompt(input);
  const references = (input.references ?? []).slice(0, 3);
  return generateImage({
    prompt,
    references: references.map((url) => ({ url })),
    cloudinaryFolder: "zaffa-posts/renders",
  });
}
