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
