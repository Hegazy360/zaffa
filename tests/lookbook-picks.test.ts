import { describe, expect, it } from "vitest";
import { pickBeforeAfter, pickPlanRender } from "@/lib/lookbook-picks";

/**
 * Which renders the lookbook's F4 pages are about. A wrong pick here prints
 * a "before and after" of two different rooms, or prices a version the
 * couple did not choose, in a PDF they paid for.
 */

const PHOTO = {
  url: "https://res.cloudinary.com/demo/image/upload/v1/zaffa-venues/u1/hall.jpg",
  publicId: "zaffa-venues/u1/hall",
  width: 2048,
  height: 1365,
};

const generate = (id: string) => ({ id, type: "render", meta: { mode: "generate" } });
const dressed = (id: string, venuePublicId?: string) => ({
  id,
  type: "render",
  meta: { mode: "dress_venue", ...(venuePublicId ? { venuePublicId } : {}) },
});

describe("pickPlanRender", () => {
  const media = [
    { id: "v1", type: "video", meta: null },
    generate("r3"),
    generate("r2"),
    generate("r1"),
  ];

  it("prices the version the couple chose", () => {
    expect(pickPlanRender(media, "r1")?.id).toBe("r1");
  });

  it("falls back to the newest render, never a video", () => {
    expect(pickPlanRender(media, null)?.id).toBe("r3");
    expect(pickPlanRender(media, "v1")?.id).toBe("r3");
    expect(pickPlanRender(media, "deleted")?.id).toBe("r3");
  });

  it("returns null for a design with no renders", () => {
    expect(pickPlanRender([{ id: "v1", type: "video" }], null)).toBeNull();
  });
});

describe("pickBeforeAfter", () => {
  it("pairs the venue photo with the newest render that dressed it", () => {
    const media = [generate("r4"), dressed("r3", PHOTO.publicId), dressed("r2", PHOTO.publicId)];
    const pair = pickBeforeAfter(PHOTO, media, null);
    expect(pair?.venuePhoto.publicId).toBe(PHOTO.publicId);
    expect(pair?.render.id).toBe("r3");
  });

  it("prefers the chosen version when it dressed the venue", () => {
    const media = [dressed("r3", PHOTO.publicId), dressed("r2", PHOTO.publicId)];
    expect(pickBeforeAfter(PHOTO, media, "r2")?.render.id).toBe("r2");
  });

  it("ignores a chosen version that is a plain render", () => {
    const media = [generate("r3"), dressed("r2", PHOTO.publicId)];
    expect(pickBeforeAfter(PHOTO, media, "r3")?.render.id).toBe("r2");
  });

  it("skips renders of a photo the couple has since replaced", () => {
    const media = [dressed("r3", "zaffa-venues/u1/old-hall")];
    expect(pickBeforeAfter(PHOTO, media, null)).toBeNull();
  });

  it("takes a dress render that predates the recorded photo id at its word", () => {
    expect(pickBeforeAfter(PHOTO, [dressed("r1")], null)?.render.id).toBe("r1");
  });

  it("needs a venue photo", () => {
    const media = [dressed("r1", PHOTO.publicId)];
    expect(pickBeforeAfter(null, media, null)).toBeNull();
    expect(pickBeforeAfter({ url: "not a photo" }, media, null)).toBeNull();
  });

  it("needs a dress render", () => {
    expect(pickBeforeAfter(PHOTO, [generate("r1")], null)).toBeNull();
    // A legacy row with no readable meta is not a dress render.
    expect(pickBeforeAfter(PHOTO, [{ id: "r0", type: "render", meta: null }], null)).toBeNull();
  });
});
