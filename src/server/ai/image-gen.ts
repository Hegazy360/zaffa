// Low-level image-gen wrapper used by:
//
//  - The user-facing venue-designer flow via `renderScene`
//    (src/server/ai/scene-generator.ts) which builds a 16:9 wedding-
//    venue prompt and forwards here.
//  - The admin post-generator pipeline (src/server/posts/) which builds
//    a 4:5 editorial portrait prompt and forwards here.
//  - The design partner modes (docs/plan-design-partner-2026-09.md):
//    dressing the couple's own venue photo and talked edits of a render.
//    Those go through `generateImageViaImagesApi`, see below.
//
// Two transports, because the models that won the bake-off live behind
// different OpenRouter endpoints:
//   * `generateImage`: chat/completions with `modalities`, the Gemini
//     path every prompt-only render has used since launch.
//   * `generateImageViaImagesApi`: the Images API (`POST /images` with
//     `input_references`). The OpenAI image models are served there, and
//     on the same lawn photo they kept the camera, palms and hedge where
//     Gemini moved the camera, at well under half the price.
//
// Centralizes:
//   * OpenRouter request shape (model + auth + attribution + modalities)
//   * Multimodal input handling (text + optional image_url refs)
//   * data-URL → Cloudinary mirroring (so DB rows don't carry MB-sized
//     base64 blobs).
//
// Two things were changed here after the five-week render outage
// (2026-07-21 → 2026-08-26), during which an empty OpenRouter balance
// killed every render and nobody noticed:
//
// 1. Attribution. This file sent only Authorization and Content-Type,
//    while src/server/llm/openrouter.ts also sends HTTP-Referer and
//    X-Title. An image call costs ~$0.136 against ~$0.001 for a chat
//    call, so the one surface that actually drained the balance was the
//    one missing from OpenRouter's per-app breakdown. Be clear about what
//    this does and does not buy: it is cost-attribution hygiene, not
//    observability. Total spend and remaining credit were always visible
//    against the key regardless of these headers, and adding them would
//    not have surfaced the outage a day sooner. What was missing was an
//    alert, not a header.
//
// 2. A structured log line per billed call, carrying `usage.cost`. This
//    path emptied a $50 balance without leaving a trace anywhere we were
//    looking, and cost-per-render was not recoverable from the app at all.
//
// On `message.images`: the Gemini image models return TWO entries per call
// and we mirror only the LAST one. A live call was decoded and measured:
// one image billed ($0.136232 for 16 prompt + 1120 image + 150 reasoning
// tokens), and the two entries pixel-equivalent apart from their C2PA
// metadata. Google documents that a thinking image model may emit interim
// images and that the last one is the final render, so the last entry is
// the one that is right by contract, not just by today's measurement.
// Mirroring the others would buy extra uploads and orphaned assets.
// `imagesReturned` is logged so a change in that count shows up in logs.
//
// Note on timeouts: none is set here on purpose. A render legitimately
// takes tens of seconds, no safe ceiling was measured, and the platform
// function timeout already bounds the request. A guessed AbortSignal
// would be a new way to break the funnel, not a fix for one.

import { cloudinary } from "@/lib/cloudinary";
import { logger } from "@/lib/logger";

const IMAGE_MODEL =
  process.env.AI_IMAGE_MODEL ?? "google/gemini-3-pro-image-preview";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** A model id plus the `quality` the Images API should run it at. */
export interface ImageModelChoice {
  model: string;
  quality: string;
}

/**
 * Model for dressing the couple's own venue photo (F1). The bake-off on a
 * real lawn and a floor-level historic hall: `gpt-image-2.5-sunburst` at
 * `high` (~$0.057) kept the camera, palm layout, hedge, ceiling and
 * columns; `gemini-3-pro-image-preview` (~$0.138) moved the camera and
 * rearranged the palms. Env-overridable so a regression can be rolled
 * back from Vercel settings without a deploy.
 */
export function venueImageModel(): ImageModelChoice {
  return {
    model: process.env.AI_VENUE_IMAGE_MODEL ?? "openai/gpt-image-2.5-sunburst",
    quality: process.env.AI_VENUE_IMAGE_QUALITY ?? "high",
  };
}

/**
 * Model for talked edits of an existing render (F2). `gpt-image-2.5-flare`
 * at `medium` (~$0.022) changed only what was asked in the bake-off
 * ("bigger floral stage and a dance floor, keep everything else"), which
 * is the whole job of an edit. Env-overridable like the venue model.
 */
export function editImageModel(): ImageModelChoice {
  return {
    model: process.env.AI_EDIT_IMAGE_MODEL ?? "openai/gpt-image-2.5-flare",
    quality: process.env.AI_EDIT_IMAGE_QUALITY ?? "medium",
  };
}

/**
 * The `X-Title` that shows up in OpenRouter's per-app usage breakdown.
 *
 * Defaulted from `cloudinaryFolder` because that is the one field the two
 * call sites already differ on, which keeps user-facing render spend
 * (`zaffa-renders`) separable from admin post-pipeline spend
 * (`zaffa-posts/renders`) without editing either caller. The posts
 * pipeline burns 3-4 images per invocation, so that split is the one that
 * decides whether a spend spike was users or us. Pass `appTitle`
 * explicitly to override.
 */
function appTitleForFolder(folder: string): string {
  const root = folder.split("/")[0];
  if (root === "zaffa-posts") return "Zaffa Posts";
  if (root === "zaffa-renders") return "Zaffa Renders";
  return "Zaffa Images";
}

/**
 * Deliberately not imported from src/server/llm/openrouter.ts. That module
 * is `import "server-only"` and its `authHeaders()` throws
 * "OPENAI_API_KEY is required for LLM calls", which is a misleading
 * message to hand someone debugging a dead image render. What must not
 * drift between the two is the referer value, so `OPENROUTER_REFERER`
 * stays the single source of truth for it.
 */
function openRouterHeaders(appTitle: string): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://zaffa.ai",
    "X-Title": appTitle,
  };
}

export interface GenerateImageInput {
  /** The text prompt, fully composed by the caller. */
  prompt: string;
  /** Optional reference images. Each is sent as a multimodal `image_url`. */
  references?: Array<{ url: string }>;
  /**
   * Cloudinary folder for mirrored uploads. Defaults to `zaffa-renders`
   * (the existing folder used by the venue designer); the post
   * generator passes `zaffa-posts/renders`.
   */
  cloudinaryFolder?: string;
  /**
   * Sent as `X-Title`, which is how OpenRouter groups spend per app.
   * Defaults to a title derived from `cloudinaryFolder`.
   */
  appTitle?: string;
  /**
   * Which product mode asked for the image (`generate`, `dress_venue`,
   * `refine`). Only logged, so the cost of each mode can be told apart in
   * the `image.generated` lines without guessing from the model id.
   */
  mode?: string;
}

export interface GenerateImageResult {
  imageUrl: string;
  /**
   * Cloudinary `public_id` when the image was mirrored through Cloudinary.
   * Null when the model returned a remote URL we passed through verbatim
   * (no opportunity to derive transformations like the watermark overlay).
   */
  publicId: string | null;
  text: string | null;
  /** The model id the request was sent to. Stored in media-row provenance. */
  model: string;
  /** What OpenRouter charged (`usage.cost`), null when it did not say. */
  costUsd: number | null;
}

interface MirrorResult {
  secureUrl: string;
  publicId: string | null;
}

/** Only the fields we actually read. */
interface OpenRouterImageResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      images?: Array<{ image_url?: { url?: string } }>;
    };
  }>;
  usage?: { cost?: number };
}

/** Only the fields we actually read from `POST /images`. */
interface OpenRouterImagesApiResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  usage?: { cost?: number };
}

/**
 * OpenRouter returns inline `data:` URLs. Mirror to Cloudinary so the
 * DB stores stable CDN URLs rather than megabyte-sized blobs. We also
 * return the public_id so callers can build signed transformation URLs
 * (e.g. the watermark overlay applied to free-tier renders) without
 * keeping a parser around `secure_url`.
 */
async function mirrorToCloudinary(
  dataUrlOrUrl: string,
  folder: string,
): Promise<MirrorResult> {
  if (!dataUrlOrUrl.startsWith("data:")) {
    return { secureUrl: dataUrlOrUrl, publicId: null };
  }
  const result = await cloudinary.uploader.upload(dataUrlOrUrl, {
    folder,
    resource_type: "image",
    type: "upload",
  });
  return { secureUrl: result.secure_url, publicId: result.public_id };
}

export async function generateImage({
  prompt,
  references = [],
  cloudinaryFolder = "zaffa-renders",
  appTitle,
  mode,
}: GenerateImageInput): Promise<GenerateImageResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for image generation");
  }

  const title = appTitle ?? appTitleForFolder(cloudinaryFolder);

  const content: Array<
    | { type: "image_url"; image_url: { url: string } }
    | { type: "text"; text: string }
  > = references.map((r) => ({
    type: "image_url" as const,
    image_url: { url: r.url },
  }));
  content.push({ type: "text", text: prompt });

  const response = await fetch(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: openRouterHeaders(title),
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(
      `Image generation failed: ${response.status} ${err.slice(0, 400)}`,
    );
  }

  const data = (await response.json()) as OpenRouterImageResponse;
  const message = data.choices?.[0]?.message;

  const rawUrls = (message?.images ?? [])
    .map((img) => img.image_url?.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);

  if (!rawUrls.length) {
    throw new Error("No image was generated");
  }

  // Only the last entry is mirrored: it is the final render (see the
  // header note), the earlier ones are interim or duplicate frames.
  const primary = await mirrorToCloudinary(
    rawUrls[rawUrls.length - 1],
    cloudinaryFolder,
  );
  const costUsd = data.usage?.cost ?? null;

  // One structured line per billed call. `usage.cost` is what OpenRouter
  // actually charged; this path is the one that emptied a $50 balance
  // without leaving a trace anywhere we were looking. `imagesReturned` is
  // here as a tripwire: it has been 2 on every call measured, and a change
  // in it means the duplicate assumption above needs re-testing.
  logger.info("image.generated", {
    mode: mode ?? null,
    model: IMAGE_MODEL,
    appTitle: title,
    costUsd,
    imagesReturned: rawUrls.length,
  });

  return {
    imageUrl: primary.secureUrl,
    publicId: primary.publicId,
    text: message?.content ?? null,
    model: IMAGE_MODEL,
    costUsd,
  };
}

export interface GenerateImageViaImagesApiInput {
  /** OpenRouter model id, usually from `venueImageModel()` / `editImageModel()`. */
  model: string;
  /** The text prompt, fully composed by the caller. */
  prompt: string;
  /**
   * Input images. Order matters: the FIRST is the base canvas the model
   * edits (the venue photo, or the render being refined); any after it
   * are style references. Must be URLs the provider can fetch.
   */
  references?: Array<{ url: string }>;
  /**
   * `"auto"` (the default) keeps the base image's own proportions, which
   * is what a before/after comparison of the couple's photo needs.
   */
  aspectRatio?: string;
  /** Provider quality tier (`low` / `medium` / `high`). Omitted when unset. */
  quality?: string;
  /** Cloudinary folder for the mirrored result. Defaults to `zaffa-renders`. */
  cloudinaryFolder?: string;
  /** `X-Title` for OpenRouter's per-app spend breakdown. */
  appTitle?: string;
  /** Product mode, logged on the `image.generated` line. */
  mode?: string;
}

/**
 * Generate (or edit) an image through OpenRouter's Images API and mirror
 * the result to Cloudinary. Same result shape as `generateImage`, so a
 * caller can switch transports without touching persistence: the media
 * row stores the clean Cloudinary URL and public id, and the free-tier
 * watermark is derived on read as before.
 *
 * No timeout, for the reason given in the header note on `generateImage`.
 */
export async function generateImageViaImagesApi({
  model,
  prompt,
  references = [],
  aspectRatio = "auto",
  quality,
  cloudinaryFolder = "zaffa-renders",
  appTitle,
  mode,
}: GenerateImageViaImagesApiInput): Promise<GenerateImageResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for image generation");
  }

  const title = appTitle ?? appTitleForFolder(cloudinaryFolder);

  const response = await fetch(`${OPENROUTER_BASE_URL}/images`, {
    method: "POST",
    headers: openRouterHeaders(title),
    body: JSON.stringify({
      model,
      prompt,
      ...(references.length > 0
        ? {
            input_references: references.map((r) => ({
              type: "image_url" as const,
              image_url: { url: r.url },
            })),
          }
        : {}),
      n: 1,
      aspect_ratio: aspectRatio,
      ...(quality ? { quality } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(
      `Image generation failed: ${response.status} ${err.slice(0, 400)}`,
    );
  }

  const raw = await response.text();
  let data: OpenRouterImagesApiResponse;
  try {
    data = JSON.parse(raw) as OpenRouterImagesApiResponse;
  } catch {
    throw new Error(
      `Image generation returned a non-JSON body: ${raw.slice(0, 200)}`,
    );
  }

  const first = data.data?.[0];
  if (!first?.b64_json) {
    // A safety refusal or an empty result. Nothing to mirror, and the
    // caller must treat it as a failure (release any reserved quota).
    throw new Error("No image was generated");
  }

  const mediaType = first.media_type ?? "image/png";
  const primary = await mirrorToCloudinary(
    `data:${mediaType};base64,${first.b64_json}`,
    cloudinaryFolder,
  );
  const costUsd = data.usage?.cost ?? null;

  logger.info("image.generated", {
    mode: mode ?? null,
    model,
    appTitle: title,
    costUsd,
    imagesReturned: data.data?.length ?? 0,
  });

  return {
    imageUrl: primary.secureUrl,
    publicId: primary.publicId,
    text: null,
    model,
    costUsd,
  };
}
