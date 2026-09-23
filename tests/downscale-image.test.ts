import { describe, expect, it } from "vitest";
import {
  downscaleToJpeg,
  fitWithin,
  ImageDecodeError,
  PHOTO_MAX_EDGE,
} from "@/lib/downscale-image";

// The venue photo is downscaled in the browser before upload (F1): a phone
// photo as a base64 tRPC body would blow Vercel's 4.5MB request limit. The
// canvas half needs a real browser (the Playwright spec runs it on a
// fixture); the geometry and the decode-failure contract are pinned here.

describe("fitWithin", () => {
  it("scales a landscape phone photo to 2048 on the long edge", () => {
    expect(fitWithin(4032, 3024, PHOTO_MAX_EDGE)).toEqual({ width: 2048, height: 1536 });
  });

  it("scales a portrait photo by its height", () => {
    expect(fitWithin(3024, 4032, PHOTO_MAX_EDGE)).toEqual({ width: 1536, height: 2048 });
  });

  it("never upscales a photo that is already small enough", () => {
    expect(fitWithin(1600, 900, PHOTO_MAX_EDGE)).toEqual({ width: 1600, height: 900 });
    expect(fitWithin(2048, 2048, PHOTO_MAX_EDGE)).toEqual({ width: 2048, height: 2048 });
  });

  it("keeps a sliver of a panorama at least one pixel tall", () => {
    expect(fitWithin(100_000, 10, PHOTO_MAX_EDGE)).toEqual({ width: 2048, height: 1 });
  });
});

describe("downscaleToJpeg", () => {
  it("throws ImageDecodeError where the browser cannot decode at all", async () => {
    // Node has no createImageBitmap, the same as an old browser: the card
    // turns this into the friendly "try a JPEG or PNG" message.
    await expect(downscaleToJpeg(new Blob(["x"]))).rejects.toBeInstanceOf(ImageDecodeError);
  });
});
