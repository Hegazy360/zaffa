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
 * Watermarked variant URL for the free-tier render reveal. Bakes a
 * "Made with Zaffa" overlay into the image via a signed Cloudinary
 * transformation. The signature prevents URL tampering when the
 * Cloudinary account has Strict Transformations enabled (ops checklist
 * item — without it, anyone who knows Cloudinary can swap the
 * transformation off).
 *
 * Server stores the clean asset (no watermark) and derives this URL on
 * read. After a paid upgrade, the same row's media is returned as the
 * clean `secure_url` — no re-rendering needed.
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
