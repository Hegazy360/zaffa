// Low-level image-gen wrapper used by both:
//
//  - The user-facing venue-designer flow via `renderScene`
//    (src/server/ai/scene-generator.ts) which builds a 16:9 wedding-
//    venue prompt and forwards here.
//  - The admin post-generator pipeline (src/server/posts/) which builds
//    a 4:5 editorial portrait prompt and forwards here.
//
// Centralizes:
//   * OpenRouter request shape (model + auth + modalities)
//   * Multimodal input handling (text + optional image_url refs)
//   * data-URL → Cloudinary mirroring (so DB rows don't carry MB-sized
//     base64 blobs).

import { cloudinary } from "@/lib/cloudinary";

const IMAGE_MODEL =
  process.env.AI_IMAGE_MODEL ?? "google/gemini-3-pro-image-preview";

export interface GenerateImageInput {
  /** The text prompt — fully composed by the caller. */
  prompt: string;
  /** Optional reference images. Each is sent as a multimodal `image_url`. */
  references?: Array<{ url: string }>;
  /**
   * Cloudinary folder for mirrored uploads. Defaults to `zaffa-renders`
   * (the existing folder used by the venue designer); the post
   * generator passes `zaffa-posts`.
   */
  cloudinaryFolder?: string;
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
}: GenerateImageInput): Promise<GenerateImageResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for image generation");
  }

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
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
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

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  if (!message?.images?.length) {
    throw new Error("No image was generated");
  }

  const rawUrl = message.images[0].image_url.url as string;
  const { secureUrl, publicId } = await mirrorToCloudinary(
    rawUrl,
    cloudinaryFolder,
  );

  return {
    imageUrl: secureUrl,
    publicId,
    text: (message.content as string | null) ?? null,
  };
}
