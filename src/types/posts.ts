// Shared TypeScript shapes for the admin Post Generator.
//
// Postgres stores the structured fields as `jsonb`; on the read path we
// hand the raw value through these types via `as` casts (mirrors the
// pattern used by ScheduleAmendment.proposed_installments). On the write
// path the generator pipeline produces objects matching these types and
// passes them straight to Prisma as `Prisma.InputJsonValue`.
//
// Keep this file pure data - no React, no Prisma imports - so it can be
// reused by both the server pipeline and the client UI without dragging
// extra deps into either bundle.

export type NamedColor = {
  /**
   * Human-readable color name (e.g. "rose dust", "verdigris"). Used as
   * the swatch label on PaletteSlide and editable in the post detail
   * sidebar. Lowercase, English, max ~20 chars.
   */
  name: string;
  /** 6-digit hex with leading `#`. */
  hex: string;
};

/**
 * A 5-color named palette. Compatible with the `DesignPalette` shape in
 * `src/types/venue-designer.ts` (also has a `name`) but with each color
 * carrying its own name. Always exactly 5 colors.
 */
export type NamedPalette = {
  /** Palette name (e.g. "tuscan dusk"). */
  name: string;
  colors: NamedColor[];
};

export type CoupleNames = {
  partner_a: string;
  partner_b: string;
};

/**
 * Concrete slide-component name. Kept as a string union here (mirrored
 * by the runtime registry in
 * `src/components/admin/post-generator/slides/registry.ts`) so the DB
 * layer can validate without importing React.
 */
export type SlideComponentName =
  | "HookSlide"
  | "InspirationSlide"
  | "PaletteSlide"
  | "FinalRenderSlide"
  | "LookbookCoverSlide"
  | "CTASlide";

/**
 * One slide in a post's carousel. `props` is intentionally permissive -
 * each component's strict prop type is enforced where the registry is
 * looked up, not at the JSON boundary.
 */
export type SlideRecord = {
  component_name: SlideComponentName;
  props: Record<string, unknown>;
  /**
   * Cloudinary URL of the 1080x1350 PNG produced by the client-side
   * rasterizer. `null` until the admin clicks "Render to HD".
   */
  rendered_png_url: string | null;
};

export type PostFormatId =
  | "inspo_to_render"
  | "palette_test"
  | "real_bride"
  | "planner_pov"
  | "three_words";

export type PostStatusId = "pending" | "published" | "discarded";

/**
 * Hydrated post shape returned from tRPC procedures. JSON columns are
 * already cast on the server boundary so the client can consume them
 * directly.
 */
export interface HydratedPost {
  id: string;
  status: PostStatusId;
  format: PostFormatId;
  vibe: string;
  palette: NamedPalette;
  couple_names: CoupleNames;
  inspiration_image_urls: string[];
  render_image_urls: string[];
  slides: SlideRecord[];
  caption: string;
  hashtags: string[];
  created_by: string;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
}

export const HASHTAG_COUNT = 5 as const;

export const SLIDE_DIMENSIONS = {
  width: 1080,
  height: 1350,
} as const;
