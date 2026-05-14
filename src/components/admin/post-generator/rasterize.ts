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

/**
 * Rasterize the given element to PNG and upload to Cloudinary. Returns
 * the public Cloudinary URL.
 */
export async function rasterizeAndUpload(
  element: HTMLElement,
): Promise<RasterizeResult> {
  await inlineImagesAsDataUrls(element);

  // `toBlob` returns a Blob directly. We deliberately avoid `toPng`
  // (which returns a `data:` URL string and forces us to fetch it back
  // to get a Blob): the app's CSP forbids `connect-src data:`, so any
  // round-trip through a data URL hits a CSP violation.
  // pixelRatio 2 → final PNG is 2160x2700 (2x the layout 1080x1350).
  // Instagram crunches anything above ~1440px wide on upload, so 2x is
  // the sweet spot: sharper than 1x on retina phones, well within
  // Cloudinary upload limits, no risk of html-to-image OOM on the iPad
  // workflow we use for triage.
  const blob = await toBlob(element, {
    type: "image/png",
    width: SLIDE_DIMENSIONS.width,
    height: SLIDE_DIMENSIONS.height,
    pixelRatio: 2,
    // `cacheBust: true` would append `?t=...` to image URLs, which a)
    // is pointless now that we've inlined every image as a data URL,
    // and b) used to break Cloudinary CORS preflight in older versions.
    cacheBust: false,
    style: {
      // html-to-image inlines computed styles; lock these so the output
      // matches the slide regardless of the parent's transform-scale.
      transform: "none",
      transformOrigin: "0 0",
    },
  });

  if (!blob) {
    throw new Error("Rasterization produced an empty blob");
  }

  const sig = await fetchSignature();
  const pngUrl = await uploadBlobToCloudinary(blob, sig);
  return { pngUrl };
}
