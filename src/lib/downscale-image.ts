// Client-side downscale for photos the couple picks from their phone.
//
// A phone photo is 3 to 12MB. The upload goes through a tRPC JSON body as a
// base64 data URL (a third bigger again), and Vercel refuses request bodies
// over 4.5MB, so the raw file fails for most of the people this is for.
// Redrawing it at 2048px on the long edge as JPEG 0.85 lands at a few
// hundred KB and still gives the image model more than it reads.
//
// `imageOrientation: "from-image"` applies the EXIF rotation while decoding;
// without it a portrait phone shot is uploaded on its side. Browsers that
// cannot decode the file (HEIC on Chrome and Firefox, a corrupt file, no
// createImageBitmap at all) throw `ImageDecodeError`, which the caller turns
// into a friendly message rather than a failed upload.

export const PHOTO_MAX_EDGE = 2048;
export const PHOTO_JPEG_QUALITY = 0.85;

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageDecodeError";
  }
}

/** Scale `width` x `height` down (never up) so the long edge is at most `maxEdge`. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface DownscaledPhoto {
  dataUrl: string;
  width: number;
  height: number;
}

export async function downscaleToJpeg(
  file: Blob,
  maxEdge = PHOTO_MAX_EDGE,
  quality = PHOTO_JPEG_QUALITY,
): Promise<DownscaledPhoto> {
  if (typeof createImageBitmap !== "function") {
    throw new ImageDecodeError("createImageBitmap is not available");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    throw new ImageDecodeError(
      err instanceof Error ? err.message : "could not decode the image",
    );
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageDecodeError("no 2d canvas context");
    // JPEG has no alpha: a transparent PNG would otherwise turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
      throw new ImageDecodeError("the browser could not encode a JPEG");
    }
    return { dataUrl, width, height };
  } finally {
    bitmap.close();
  }
}
