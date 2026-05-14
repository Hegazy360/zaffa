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

import { toBlob } from "html-to-image";
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
 * Convert every cross-origin `<img>` inside `root` into a `data:` URL.
 *
 * Why: `html-to-image` walks the DOM and calls `toCanvas`. Plain `<img>`
 * tags loaded without `crossOrigin="anonymous"` taint the canvas, which
 * makes the subsequent `toDataURL("image/png")` throw a SecurityError —
 * silently from the user's POV because it bubbles as a generic
 * exception. Pre-inlining via `fetch` (which Cloudinary serves with
 * permissive CORS) bypasses the taint entirely.
 *
 * We mutate the DOM in place, but the slide tree only lives in the
 * hidden 1080x1350 mount on the post detail page so this isn't visible
 * to the user. Idempotent — already-inlined `data:` URLs are skipped.
 */
async function inlineImagesAsDataUrls(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      try {
        const res = await fetch(src, { mode: "cors", credentials: "omit" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("FileReader failed"));
          reader.readAsDataURL(blob);
        });
        img.setAttribute("src", dataUrl);
        // Wait for the swapped src to actually decode, otherwise
        // html-to-image may snapshot a half-loaded image.
        if (typeof img.decode === "function") {
          await img.decode().catch(() => {});
        } else {
          await new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        }
      } catch (err) {
        // Don't fail the whole rasterization for one missing image —
        // the slide will just snapshot with a blank/broken tile in
        // that spot. Logged so the operator can dig in.
        console.warn(
          "[rasterize] failed to inline image; slide may be incomplete:",
          src,
          err,
        );
      }
    }),
  );
}

// Cloudinary's free tier rejects uploads larger than 10 MB ("File size
// too large, upgrade plan..."). We stay a comfortable margin under that
// cap — multipart envelope adds ~1 KB and we'd rather degrade gracefully
// than fail outright on a single slide.
const MAX_UPLOAD_BYTES = 9.5 * 1024 * 1024;

// JPEG quality tiers tried in order when the PNG exceeds the size cap.
// Each step is roughly a 25% size reduction in practice; 0.72 is the
// floor before posterization shows up on smooth gradients (palette
// swatches, sky in renders).
const JPEG_QUALITY_TIERS = [0.92, 0.85, 0.78, 0.72] as const;

// pixelRatio 2 → 2160x2700 output (2x the 1080x1350 layout). Instagram
// crunches anything above ~1440px wide on upload, so 2x is the sweet
// spot: sharper than 1x on retina phones, within sensible upload limits,
// no risk of html-to-image OOM on the iPad workflow we use for triage.
const PIXEL_RATIO = 2;

const BASE_RASTER_OPTIONS = {
  width: SLIDE_DIMENSIONS.width,
  height: SLIDE_DIMENSIONS.height,
  pixelRatio: PIXEL_RATIO,
  // `cacheBust: true` would append `?t=...` to image URLs, which a) is
  // pointless now that we've inlined every image as a data URL, and b)
  // used to break Cloudinary CORS preflight in older versions.
  cacheBust: false,
  style: {
    // html-to-image inlines computed styles; lock these so the output
    // matches the slide regardless of the parent's transform-scale.
    transform: "none",
    transformOrigin: "0 0",
  },
} as const;

/**
 * Rasterize the given element and upload to Cloudinary.
 *
 * Strategy: try PNG first (highest fidelity, lossless palette swatches).
 * If the PNG exceeds Cloudinary's 10 MB free-tier cap — typical for
 * photo-heavy slides like FinalRenderSlide — fall back to progressively
 * lower-quality JPEG until something fits. PNG is preferred for
 * slides dominated by flat color (PaletteSlide, CTASlide) where JPEG
 * banding would show up; JPEG is fine for photo slides where the source
 * is already a Cloudinary-hosted JPEG anyway.
 *
 * We deliberately avoid `toPng`/`toJpeg` (which return data URLs) so
 * we never round-trip through `fetch(dataUrl)` — the app's CSP forbids
 * `connect-src data:`.
 */
export async function rasterizeAndUpload(
  element: HTMLElement,
): Promise<RasterizeResult> {
  await inlineImagesAsDataUrls(element);

  let blob = await toBlob(element, {
    ...BASE_RASTER_OPTIONS,
    type: "image/png",
  });

  if (!blob) {
    throw new Error("Rasterization produced an empty blob");
  }

  if (blob.size > MAX_UPLOAD_BYTES) {
    // PNG too large — walk down the JPEG quality ladder until it fits.
    let lastSize = blob.size;
    let fitted = false;
    for (const quality of JPEG_QUALITY_TIERS) {
      const candidate = await toBlob(element, {
        ...BASE_RASTER_OPTIONS,
        type: "image/jpeg",
        quality,
      });
      if (!candidate) continue;
      lastSize = candidate.size;
      if (candidate.size <= MAX_UPLOAD_BYTES) {
        blob = candidate;
        fitted = true;
        break;
      }
    }
    if (!fitted) {
      throw new Error(
        `Slide too large to upload (${(lastSize / 1024 / 1024).toFixed(1)} MB > ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)} MB) even at JPEG q=${JPEG_QUALITY_TIERS[JPEG_QUALITY_TIERS.length - 1]}`,
      );
    }
  }

  const sig = await fetchSignature();
  const pngUrl = await uploadBlobToCloudinary(blob, sig);
  return { pngUrl };
}
