import { describe, expect, it } from "vitest";
import { cloudinaryLoader } from "@/lib/cloudinary-loader";

const CLOUD = "https://res.cloudinary.com/dz0tdjoqj/image/upload";

describe("cloudinaryLoader", () => {
  it("inserts a resize into a plain delivery URL", () => {
    const out = cloudinaryLoader({
      src: `${CLOUD}/v1778150961/zaffa-renders/abc.jpg`,
      width: 640,
    });
    expect(out).toBe(
      `${CLOUD}/f_auto,q_auto,w_640,c_limit/v1778150961/zaffa-renders/abc.jpg`,
    );
  });

  it("leaves a SIGNED url completely untouched", () => {
    // This is the one that matters. `watermarkedUrl` signs its transformation
    // so the watermark cannot be stripped by editing the URL; appending our
    // own segment invalidates the signature, and with Strict Transformations
    // on, Cloudinary answers 401. The free-tier reveal would show a broken
    // image rather than a watermarked render.
    const signed = `${CLOUD}/s--AbC123_x--/c_limit,w_1600/l_text:Arial_48:Made%20with%20Zaffa/v1/renders/x.jpg`;
    expect(cloudinaryLoader({ src: signed, width: 400 })).toBe(signed);
  });

  it("composes with an existing transformation rather than replacing it", () => {
    const src = `${CLOUD}/c_fill,g_auto,h_400,w_400/v1/renders/x.jpg`;
    const out = cloudinaryLoader({ src, width: 800 });
    // Ours first: chained transformations apply left to right, and a resize
    // has to happen before a crop that assumes the resized dimensions.
    expect(out).toBe(
      `${CLOUD}/f_auto,q_auto,w_800,c_limit/c_fill,g_auto,h_400,w_400/v1/renders/x.jpg`,
    );
    expect(out).toContain("c_fill,g_auto,h_400,w_400");
  });

  it("honours an explicit quality", () => {
    expect(
      cloudinaryLoader({ src: `${CLOUD}/v1/x.jpg`, width: 100, quality: 60 }),
    ).toContain("q_60");
  });

  it("passes non-Cloudinary URLs straight through", () => {
    for (const src of [
      "https://project.supabase.co/storage/v1/object/public/media/x.jpg",
      "/home/examples/hero.jpeg",
      "https://example.com/a.png",
    ]) {
      expect(cloudinaryLoader({ src, width: 800 })).toBe(src);
    }
  });

  it("returns a Cloudinary URL it cannot parse unchanged rather than corrupting it", () => {
    const odd = "https://res.cloudinary.com/dz0tdjoqj/raw/x.jpg";
    expect(cloudinaryLoader({ src: odd, width: 400 })).toBe(odd);
  });

  it("never upscales: c_limit, not c_fill", () => {
    const out = cloudinaryLoader({ src: `${CLOUD}/v1/x.jpg`, width: 4000 });
    expect(out).toContain("c_limit");
    expect(out).not.toContain("c_fill");
  });
});
