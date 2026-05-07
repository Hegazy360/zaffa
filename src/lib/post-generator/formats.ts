// Format catalog + slide-order plan for the post generator.
//
// One format = one carousel layout (5 slides). Each plan entry says
// which slide component renders, and any per-slide hints (variant,
// renderIndex, framing, etc.) the generator should bake into the
// slide's `props`. The generator translates this plan into the
// concrete `SlideRecord[]` that ends up in the DB.

import type { PostFormatId, SlideComponentName } from "@/types/posts";

export type HookVariant = "default" | "fourUp" | "chaosToClarity";

export type RenderFraming = "default" | "detail" | "wide";

export interface SlidePlan {
  component: SlideComponentName;
  /** Variant for HookSlide. Ignored otherwise. */
  variant?: HookVariant;
  /** Index into `render_image_urls`. Defaults to 0. */
  renderIndex?: number;
  /** When true, FinalRenderSlide overlays the palette on the render. */
  paletteOverlay?: boolean;
  /** Index into a 3-element `threeWords` array; only used by `three_words`. */
  threeWordCaption?: 0 | 1 | 2;
  /** Used by FinalRenderSlide for `real_bride`. */
  framing?: RenderFraming;
}

/**
 * Slide order per format. Mirrors the spec block in the plan. The
 * renderer walks this top-to-bottom.
 */
export const FORMAT_SLIDE_PLANS: Record<PostFormatId, SlidePlan[]> = {
  inspo_to_render: [
    { component: "HookSlide", variant: "default" },
    { component: "InspirationSlide" },
    { component: "PaletteSlide" },
    { component: "FinalRenderSlide", renderIndex: 0 },
    { component: "LookbookCoverSlide" },
  ],
  palette_test: [
    { component: "HookSlide", variant: "fourUp" },
    { component: "FinalRenderSlide", renderIndex: 0, paletteOverlay: true },
    { component: "FinalRenderSlide", renderIndex: 1, paletteOverlay: true },
    { component: "FinalRenderSlide", renderIndex: 2, paletteOverlay: true },
    { component: "FinalRenderSlide", renderIndex: 3, paletteOverlay: true },
  ],
  real_bride: [
    { component: "HookSlide", variant: "default" },
    { component: "InspirationSlide" },
    { component: "PaletteSlide" },
    { component: "FinalRenderSlide", renderIndex: 0, framing: "detail" },
    { component: "FinalRenderSlide", renderIndex: 0, framing: "wide" },
  ],
  planner_pov: [
    { component: "HookSlide", variant: "chaosToClarity" },
    { component: "FinalRenderSlide", renderIndex: 0 },
    { component: "FinalRenderSlide", renderIndex: 1 },
    { component: "FinalRenderSlide", renderIndex: 2 },
    { component: "LookbookCoverSlide" },
  ],
  three_words: [
    { component: "HookSlide", variant: "default" },
    { component: "FinalRenderSlide", renderIndex: 0, threeWordCaption: 0 },
    { component: "FinalRenderSlide", renderIndex: 1, threeWordCaption: 1 },
    { component: "FinalRenderSlide", renderIndex: 2, threeWordCaption: 2 },
    { component: "CTASlide" },
  ],
};

/**
 * How many distinct render images the format needs from the image-gen
 * step. Equals `max(renderIndex)+1` across the plan.
 */
export const FORMAT_RENDER_COUNT: Record<PostFormatId, number> = {
  inspo_to_render: 1,
  palette_test: 4,
  real_bride: 1,
  planner_pov: 3,
  three_words: 3,
};

/**
 * Roulette weights. inspo_to_render and planner_pov are the highest
 * converters per the spec, so they get 3x weight.
 */
export const FORMAT_WEIGHTS: Record<PostFormatId, number> = {
  inspo_to_render: 3,
  palette_test: 1,
  real_bride: 1,
  planner_pov: 3,
  three_words: 1,
};

export const ALL_FORMAT_IDS: PostFormatId[] = [
  "inspo_to_render",
  "palette_test",
  "real_bride",
  "planner_pov",
  "three_words",
];

export const FORMAT_LABELS: Record<PostFormatId, string> = {
  inspo_to_render: "inspo → render",
  palette_test: "palette test",
  real_bride: "real bride",
  planner_pov: "planner pov",
  three_words: "three words",
};

export function pickFormat(rng: () => number = Math.random): PostFormatId {
  const total = ALL_FORMAT_IDS.reduce((s, id) => s + FORMAT_WEIGHTS[id], 0);
  let roll = rng() * total;
  for (const id of ALL_FORMAT_IDS) {
    roll -= FORMAT_WEIGHTS[id];
    if (roll <= 0) return id;
  }
  return ALL_FORMAT_IDS[0];
}
