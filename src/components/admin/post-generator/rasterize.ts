// Client-side slide rasterizer.
//
// Flow per slide:
//   1. Caller hands us a DOM element rendered at 1080x1350 (the post
//      detail page mounts a hidden full-size copy of every slide).
//   2. We snapshot the element with `html-to-image` → PNG dataUrl.
//   3. We hit `/api/admin/posts/upload-signature` for a signed
//      Cloudinary payload.
//   4. We POST the PNG blob directly to Cloudinary's REST endpoint.
//   5. We return the Cloudinary `secure_url` to the caller, which then
//      calls `adminPosts.attachRasterizedSlide` to persist it.

"use client";

import { toPng } from "html-to-image";
import { SLIDE_DIMENSIONS } from "@/types/posts";

export interface RasterizeResult {
  pngUrl: string;
}

interface UploadSignature {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
}

async function fetchSignature(): Promise<UploadSignature> {
  const res = await fetch("/api/admin/posts/upload-signature", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Upload signature failed (${res.status})`);
  }
  return (await res.json()) as UploadSignature;
}

async function uploadBlobToCloudinary(
  blob: Blob,
  sig: UploadSignature,
): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob);
  fd.append("api_key", sig.api_key);
  fd.append("timestamp", String(sig.timestamp));
  fd.append("signature", sig.signature);
  fd.append("folder", sig.folder);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,
    { method: "POST", body: fd },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary upload failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) {
    throw new Error("Cloudinary response missing secure_url");
  }
  return data.secure_url;
}

/**
 * Rasterize the given element to PNG and upload to Cloudinary. Returns
 * the public Cloudinary URL.
 */
export async function rasterizeAndUpload(
  element: HTMLElement,
): Promise<RasterizeResult> {
  const dataUrl = await toPng(element, {
    width: SLIDE_DIMENSIONS.width,
    height: SLIDE_DIMENSIONS.height,
    pixelRatio: 1,
    cacheBust: true,
    style: {
      // html-to-image inlines computed styles; lock these so the output
      // matches the slide regardless of the parent's transform-scale.
      transform: "none",
      transformOrigin: "0 0",
    },
  });

  const blob = await (await fetch(dataUrl)).blob();
  const sig = await fetchSignature();
  const pngUrl = await uploadBlobToCloudinary(blob, sig);
  return { pngUrl };
}
