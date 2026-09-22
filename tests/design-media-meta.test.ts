import { describe, expect, it } from "vitest";
import {
  parseMediaMeta,
  parseVenuePhoto,
  toClientMediaMeta,
} from "@/lib/design-media-meta";

const PHOTO = {
  url: "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-venues/u1/lawn.jpg",
  publicId: "zaffa-venues/u1/lawn",
  width: 2048,
  height: 1536,
};

describe("parseVenuePhoto", () => {
  it("reads a well-formed photo", () => {
    expect(parseVenuePhoto(PHOTO)).toEqual(PHOTO);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "https://example.com/a.jpg"],
    ["an array", [PHOTO]],
    ["http, not https", { ...PHOTO, url: "http://res.cloudinary.com/x.jpg" }],
    ["a non-integer width", { ...PHOTO, width: 20.5 }],
    ["a missing publicId", { ...PHOTO, publicId: undefined }],
    ["a zero height", { ...PHOTO, height: 0 }],
  ])("returns null for %s instead of throwing", (_label, value) => {
    expect(parseVenuePhoto(value)).toBeNull();
  });
});

describe("parseMediaMeta", () => {
  it("reads full provenance", () => {
    const meta = {
      mode: "refine",
      model: "openai/gpt-image-2.5-flare",
      costUsd: 0.022,
      instructionRaw: "خلّوا الكوشة أكبر",
      instructionEn: "Make the stage larger.",
      confirmation: "هنكبّر الكوشة",
    };
    expect(parseMediaMeta(meta)).toEqual(meta);
  });

  it("returns null without a known mode, the one field it will not guess", () => {
    expect(parseMediaMeta({ model: "x" })).toBeNull();
    expect(parseMediaMeta({ mode: "upscale" })).toBeNull();
    expect(parseMediaMeta(null)).toBeNull();
    expect(parseMediaMeta("generate")).toBeNull();
  });

  it("drops a malformed optional field instead of the whole record", () => {
    const meta = parseMediaMeta({
      mode: "generate",
      model: "google/gemini-3-pro-image-preview",
      costUsd: "0.13",
    });
    expect(meta).not.toBeNull();
    expect(meta?.model).toBe("google/gemini-3-pro-image-preview");
    expect(meta?.costUsd).toBeUndefined();
  });

  it("keeps keys it does not know, so a read-modify-write cannot erase them", () => {
    const meta = parseMediaMeta({
      mode: "generate",
      decor: { items: [{ kind: "arch" }] },
      futureKey: 1,
    });
    expect(meta).toMatchObject({
      decor: { items: [{ kind: "arch" }] },
      futureKey: 1,
    });
  });
});

describe("toClientMediaMeta", () => {
  it("never hands the browser our model or what we paid", () => {
    const client = toClientMediaMeta({
      mode: "refine",
      model: "openai/gpt-image-2.5-flare",
      costUsd: 0.022,
      instructionRaw: "warmer lights",
      instructionEn: "Change the lighting to a warmer tone.",
      confirmation: "Warmer lighting",
    });
    expect(client).toEqual({
      mode: "refine",
      instructionRaw: "warmer lights",
      confirmation: "Warmer lighting",
    });
    expect(JSON.stringify(client)).not.toMatch(/cost|model|gpt|instructionEn/i);
  });

  it("is null for a row with no readable meta (every render made before F0)", () => {
    expect(toClientMediaMeta(null)).toBeNull();
  });
});
