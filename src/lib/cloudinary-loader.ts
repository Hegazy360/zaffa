/**
 * A client-safe Cloudinary URL builder for `next/image`.
 *
 * Pure string manipulation — deliberately not the Cloudinary SDK, which pulls
 * `node:crypto` and the account credentials into whatever imports it. This
 * runs in the browser.
 *
 * Three rules, in priority order:
 *
 *  1. **Never touch a signed URL.** `watermarkedUrl` signs its transformation
 *     (`s--<sig>--`) precisely so nobody can strip the watermark by editing the
 *     URL. Appending our own segment invalidates that signature, and with
 *     Strict Transformations enabled Cloudinary answers 401 — the free-tier
 *     reveal would show a broken image instead of a watermarked render. Signed
 *     URLs pass through untouched, which costs us the resize and is the
 *     correct trade.
 *  2. **Compose, don't clobber.** An unsigned URL may already carry a
 *     transformation (a crop, a named preset). Ours is *prepended* to that
 *     chain rather than replacing it, because Cloudinary applies chained
 *     transformations left to right and a resize has to come before a crop
 *     that assumes the resized dimensions.
 *  3. **Anything that is not Cloudinary is returned as-is**, so Supabase and
 *     local assets fall through to Next's own optimizer.
 */

const CLOUDINARY_HOST = "res.cloudinary.com";

/** `/upload/` or `/fetch/` — the delivery type segment we insert after. */
const DELIVERY = /\/(image|video)\/(upload|fetch|authenticated)\//;

/** Cloudinary marks a signed URL with an `s--<signature>--` path segment. */
const SIGNED = /\/s--[A-Za-z0-9_-]+--\//;

export interface CloudinaryLoaderArgs {
  src: string;
  width: number;
  quality?: number;
}

export function cloudinaryLoader({
  src,
  width,
  quality,
}: CloudinaryLoaderArgs): string {
  if (!src.includes(CLOUDINARY_HOST)) return src;
  if (SIGNED.test(src)) return src;

  const match = DELIVERY.exec(src);
  if (!match) return src;

  const insertAt = match.index + match[0].length;
  // `c_limit` rather than `c_fill`: never upscale, and never crop. The caller
  // controls the frame with CSS; the loader's only job is to stop shipping a
  // 4 MB render into a 300px card.
  const transform = `f_auto,q_${quality ?? "auto"},w_${width},c_limit`;

  return src.slice(0, insertAt) + transform + "/" + src.slice(insertAt);
}

/**
 * `sizes` presets.
 *
 * `sizes` is the only thing that makes `srcset` useful, and it is the thing
 * everybody omits — without it the browser assumes the image is the full
 * viewport width and downloads the largest candidate, which is exactly the
 * behaviour we are trying to fix. Naming the common frames makes the right
 * value the easy one.
 */
export const IMAGE_SIZES = {
  /** Avatars, chips, small square media. */
  thumb: "40px",
  /** A card in a 1/2/3-column responsive grid. */
  card: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  /** A half-width editorial image beside text. */
  half: "(min-width: 1024px) 50vw, 100vw",
  /** Full-bleed hero. */
  hero: "100vw",
} as const;

export type ImageSizePreset = keyof typeof IMAGE_SIZES;
