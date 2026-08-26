// Low-level image-gen wrapper used by both:
//
//  - The user-facing venue-designer flow via `renderScene`
//    (src/server/ai/scene-generator.ts) which builds a 16:9 wedding-
//    venue prompt and forwards here.
//  - The admin post-generator pipeline (src/server/posts/) which builds
//    a 4:5 editorial portrait prompt and forwards here.
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
// One thing that was investigated and deliberately NOT changed: this model
// returns TWO entries in `message.images` per call, and we read `[0]` and
// ignore the second. That looks like waste and is not. A live call was
// decoded and measured: `usage` was 16 prompt + 1120 image + 150 reasoning
// tokens, which prices out at exactly the $0.136232 charged, i.e. ONE image
// billed. The two entries were also pixel-equivalent (max channel delta
// 4/255, mean 0.59, no pixel differing by more than 32) - JPEG re-encode
// noise, differing only in their APP11/C2PA metadata segment. So the second
// entry is a duplicate the charge did not pay for, and mirroring it to
// Cloudinary would buy a second upload, a second round of latency, and an
// orphaned asset nothing references. `imagesReturned` is logged below so
// that if this model ever starts returning genuine variants, we find out
// from the logs rather than from a guess.
//
// Note on timeouts: none is set here on purpose. A render legitimately
// takes tens of seconds, no safe ceiling was measured, and the platform
// function timeout already bounds the request. A guessed AbortSignal
// would be a new way to break the funnel, not a fix for one.

import { cloudinary } from "@/lib/cloudinary";
import { logger } from "@/lib/logger";

const IMAGE_MODEL =
  process.env.AI_IMAGE_MODEL ?? "google/gemini-3-pro-image-preview";

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
    "https://openrouter.ai/api/v1/chat/completions",
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

  // Only the first entry is mirrored. See the header note: the others are
  // metadata-only duplicates of it that the charge did not pay for.
  const primary = await mirrorToCloudinary(rawUrls[0], cloudinaryFolder);

  // One structured line per billed call. `usage.cost` is what OpenRouter
  // actually charged; this path is the one that emptied a $50 balance
  // without leaving a trace anywhere we were looking. `imagesReturned` is
  // here as a tripwire: it has been 2 on every call measured, and a change
  // in it means the duplicate assumption above needs re-testing.
  logger.info("image.generated", {
    model: IMAGE_MODEL,
    appTitle: title,
    costUsd: data.usage?.cost ?? null,
    imagesReturned: rawUrls.length,
  });

  return {
    imageUrl: primary.secureUrl,
    publicId: primary.publicId,
    text: message?.content ?? null,
  };
}
