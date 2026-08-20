// Single source of truth mapping a `SlideComponentName` (stored in the
// `slides` JSON column) to its React component.
//
// The carousel preview AND the rasterizer both go through this map -
// nobody else should `import` slide components directly.

import type { ComponentType } from "react";
import type { SlideComponentName, SlideRecord } from "@/types/posts";
import { HookSlide, type HookSlideProps } from "./HookSlide";
import { InspirationSlide, type InspirationSlideProps } from "./InspirationSlide";
import { PaletteSlide, type PaletteSlideProps } from "./PaletteSlide";
import { FinalRenderSlide, type FinalRenderSlideProps } from "./FinalRenderSlide";
import { LookbookCoverSlide, type LookbookCoverSlideProps } from "./LookbookCoverSlide";
import { CTASlide, type CTASlideProps } from "./CTASlide";

export const SLIDE_REGISTRY = {
  HookSlide,
  InspirationSlide,
  PaletteSlide,
  FinalRenderSlide,
  LookbookCoverSlide,
  CTASlide,
} as const satisfies Record<SlideComponentName, ComponentType<never>>;

export interface SlidePropsByName {
  HookSlide: HookSlideProps;
  InspirationSlide: InspirationSlideProps;
  PaletteSlide: PaletteSlideProps;
  FinalRenderSlide: FinalRenderSlideProps;
  LookbookCoverSlide: LookbookCoverSlideProps;
  CTASlide: CTASlideProps;
}

/**
 * Render a slide record by looking up the component via the registry.
 * Returns `null` for unknown component names (defensive, should never
 * happen in practice since the DB is the only writer).
 */
export function RenderSlideRecord({ record }: { record: SlideRecord }) {
  const Component = SLIDE_REGISTRY[record.component_name] as
    | ComponentType<Record<string, unknown>>
    | undefined;
  if (!Component) return null;
  return <Component {...record.props} />;
}
