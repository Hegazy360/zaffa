import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

export function getOptimizedUrl(
  publicId: string,
  options: { width?: number; height?: number; quality?: string } = {}
) {
  return cloudinary.url(publicId, {
    fetch_format: "auto",
    quality: options.quality ?? "auto",
    width: options.width,
    height: options.height,
    crop: "fill",
    gravity: "auto",
  });
}

/**
 * Print-sized variant for the lookbook PDF. Chromium downloads every
 * image before printing, and the stored originals are full-resolution -
 * on a 20-image document that difference is what pushes a cold render
 * past the route timeout. `crop: "limit"` preserves aspect ratio and
 * never upscales; JPEG because the PDF re-encodes anyway and decodes it
 * fastest.
 */
export function printSizedUrl(publicId: string, width: number): string {
  return cloudinary.url(publicId, {
    secure: true,
    fetch_format: "jpg",
    quality: "auto:good",
    transformation: [{ width, crop: "limit" }],
  });
}

/**
 * The couple's venue photo as the image model receives it (F1): about
 * 1536px on the long edge, JPEG. The stored upload can be up to 2048px,
 * and every input pixel is billed as tokens on the Images API. Built from
 * the public id on the server, so a dress-venue render never fetches a URL
 * the client chose, and signed so it resolves whether or not the account
 * has Strict Transformations on.
 */
export function venueModelInputUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    sign_url: true,
    type: "upload",
    secure: true,
    format: "jpg",
    quality: "auto:good",
    transformation: [{ width: 1536, height: 1536, crop: "limit" }],
  });
}

/**
 * Watermarked variant URL for the free-tier render reveal. Bakes a
 * "Made with Zaffa" overlay into the image via a signed Cloudinary
 * transformation. The signature stops anyone minting a different
 * derivative when the account has Strict Transformations enabled.
 *
 * It does NOT keep the clean render private, and nothing downstream
 * should assume it does. The URL ends in `/v1/<public id>`, renders are
 * uploaded as public `type: "upload"` assets (`mirrorToCloudinary` in
 * src/server/ai/image-gen.ts), and Strict Transformations never guarded
 * originals: delete the signature and transformation segments and the
 * CDN serves the unwatermarked file. So this is a visible mark, a
 * deterrent, not access control. Making it real means uploading renders
 * as `type: "authenticated"` (and moving the existing ones), then
 * signing both the clean URL paid tiers get and this one.
 *
 * Server stores the clean asset (no watermark) and derives this URL on
 * read. After a paid upgrade, the same row's media is returned as the
 * clean `secure_url`, no re-rendering needed.
 *
 * Positioning: bottom-right at ~70% opacity, sized relative to the image
 * width so it scales with thumbnails / hero crops alike.
 */
export function watermarkedUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    sign_url: true,
    type: "upload",
    secure: true,
    fetch_format: "auto",
    quality: "auto",
    transformation: [
      // Cap the render at 1600px wide so the watermark stays at a
      // predictable physical size; aspect ratio is preserved.
      { width: 1600, crop: "limit" },
      {
        overlay: {
          font_family: "Arial",
          font_size: 48,
          font_weight: "bold",
          text: "Made%20with%20Zaffa",
        },
        color: "white",
        opacity: 70,
        gravity: "south_east",
        x: 32,
        y: 32,
      },
    ],
  });
}
