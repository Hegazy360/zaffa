// Top-level orchestrator for the admin post generator.
//
// Flow:
//   1. Pick format / vibe / palette (auto-pick when not supplied,
//      weighted toward MENA + the higher-converting formats).
//   2. Fetch + mirror Pinterest inspiration images.
//   3. Generate N renders (4:5 portrait) — N depends on the format.
//   4. Generate a caption + 5 hashtags via the Zaffa-voice LLM helper.
//      For the `three_words` format, also generate the three-word
//      triptych captions.
//   5. Compose the slide list per the format plan.
//   6. Persist as `pending`. The admin reviews and rasterizes from the
//      detail page later — generation is fire-and-forget.

import { prisma } from "@/lib/prisma";
import {
  pickFormat,
  FORMAT_RENDER_COUNT,
} from "@/lib/post-generator/formats";
import type {
  CoupleNames,
  HydratedPost,
  NamedPalette,
  PostFormatId,
  PostStatusId,
  SlideRecord,
} from "@/types/posts";
import { pickCoupleNames } from "./couple-names";
import { fetchInspiration } from "./inspiration";
import { renderPostImage } from "./render";
import {
  generateCaptionAndTags,
  generateThreeWords,
  generateVibe,
  namePalette,
} from "./llm";
import { composeSlides } from "./compose-slides";

export interface GeneratePostInput {
  format?: PostFormatId;
  vibe?: string;
  palette?: NamedPalette;
  coupleNames?: CoupleNames;
  /** Profile.id of the admin who triggered the generation. */
  createdBy: string;
}

const VARIANT_SEEDS = [
  "wide establishing shot of the full reception",
  "tight detail of a single tablescape with linens and florals",
  "lighting hero with chandelier or candle field as the focal point",
  "overhead three-quarter of a styled sweetheart corner",
];

export async function generatePost(
  input: GeneratePostInput,
): Promise<HydratedPost> {
  const format: PostFormatId = input.format ?? pickFormat();
  const vibe = (input.vibe ?? (await pickFreshVibe())).toLowerCase().trim();
  const coupleNames = input.coupleNames ?? pickCoupleNames();

  // Palette: caller-supplied wins; otherwise we ask the LLM to name one
  // for the vibe.
  const palette: NamedPalette = input.palette ?? (await namePalette({ vibe }));

  // Inspiration FIRST — we use the URLs as references for the renders
  // so the model sees the moodboard.
  const { imageUrls: inspirationImageUrls } = await fetchInspiration({
    vibe,
    count: 8,
  });

  // Render N variants in parallel using the inspiration URLs as refs.
  const renderCount = FORMAT_RENDER_COUNT[format];
  const renderResults = await Promise.all(
    Array.from({ length: renderCount }, (_, i) =>
      renderPostImage({
        vibe,
        palette,
        references: inspirationImageUrls.slice(0, 3),
        variantSeed: VARIANT_SEEDS[i % VARIANT_SEEDS.length],
      }),
    ),
  );
  const renderImageUrls = renderResults.map((r) => r.imageUrl);

  // Caption + hashtags + (when needed) three-word triptych.
  const [{ caption, hashtags }, threeWords] = await Promise.all([
    generateCaptionAndTags({ vibe, format, palette, coupleNames }),
    format === "three_words"
      ? generateThreeWords({ vibe, palette })
      : Promise.resolve<[string, string, string] | undefined>(undefined),
  ]);

  // Hook copy — kept simple here; can be elaborated later via a
  // dedicated LLM call if we want format-specific hook variants.
  const hookHeadline =
    format === "palette_test"
      ? "one palette, four ways."
      : format === "three_words"
        ? `${vibe}.`
        : format === "planner_pov"
          ? "from chaos to clarity."
          : `${vibe} wedding,\nfully designed.`;

  const slides: SlideRecord[] = composeSlides({
    format,
    vibe,
    palette,
    coupleNames,
    inspirationImageUrls,
    renderImageUrls,
    threeWords,
    hookHeadline,
  });

  const created = await prisma.post.create({
    data: {
      status: "pending",
      format,
      vibe,
      palette: palette as unknown as object,
      couple_names: coupleNames as unknown as object,
      inspiration_image_urls: inspirationImageUrls as unknown as object,
      render_image_urls: renderImageUrls as unknown as object,
      slides: slides as unknown as object,
      caption,
      hashtags: hashtags as unknown as object,
      created_by: input.createdBy,
    },
  });

  return hydrate(created);
}

// ---------- helpers ----------

/**
 * Ask the LLM for a fresh vibe, biased to avoid the last ~30 posts'
 * vibes so the feed doesn't repeat itself. Falls back to a small
 * baked-in fallback list only if the LLM call throws (network outage,
 * key missing in local dev, etc.) — the goal is to never block
 * generation on the vibe step.
 */
async function pickFreshVibe(): Promise<string> {
  let recentVibes: string[] = [];
  try {
    const recent = await prisma.post.findMany({
      select: { vibe: true },
      orderBy: { created_at: "desc" },
      take: 30,
    });
    recentVibes = recent.map((r) => r.vibe).filter(Boolean);
  } catch {
    // Non-fatal — empty list is fine, the LLM just won't dedupe.
  }
  try {
    const out = await generateVibe({ recentVibes });
    return out.vibe;
  } catch (err) {
    console.warn("[posts] vibe LLM failed, using fallback:", err);
    return FALLBACK_VIBES[
      Math.floor(Math.random() * FALLBACK_VIBES.length)
    ];
  }
}

/**
 * Last-ditch vibe pool. Only used when the LLM call fails — keep it
 * short on purpose so we lean on the LLM for variety.
 */
const FALLBACK_VIBES = [
  "cairo rooftop",
  "riad courtyard",
  "tuscan garden",
  "beirut garden",
  "pampas grass dusk",
];

/**
 * Cast the JSON columns into their TypeScript shapes on the read
 * boundary. Mirrors the pattern in `src/server/routers/payment-schedules.ts`
 * for `proposed_installments`.
 */
export function hydrate<T extends {
  id: string;
  status: PostStatusId;
  format: PostFormatId;
  vibe: string;
  palette: unknown;
  couple_names: unknown;
  inspiration_image_urls: unknown;
  render_image_urls: unknown;
  slides: unknown;
  caption: string;
  hashtags: unknown;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
}>(row: T): HydratedPost {
  return {
    id: row.id,
    status: row.status,
    format: row.format,
    vibe: row.vibe,
    palette: row.palette as NamedPalette,
    couple_names: row.couple_names as CoupleNames,
    inspiration_image_urls: (row.inspiration_image_urls as string[]) ?? [],
    render_image_urls: (row.render_image_urls as string[]) ?? [],
    slides: (row.slides as SlideRecord[]) ?? [],
    caption: row.caption,
    hashtags: (row.hashtags as string[]) ?? [],
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: row.published_at,
  };
}
