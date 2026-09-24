import { describe, expect, it } from "vitest";
import {
  compareBeforePhoto,
  findDressVenueAncestor,
  isOwnVenuePublicId,
  type LineageRow,
} from "@/lib/venue-photo";

// The one rule both the designer and the reveal page use to decide whether
// a render gets a before/after slider, and which photo is its "before".

const PHOTO = {
  url: "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-venues/u1/hall.jpg",
  publicId: "zaffa-venues/u1/hall",
  width: 1600,
  height: 900,
};

function row(
  id: string,
  parent_id: string | null,
  mode: LineageRow["mode"],
  venuePublicId: string | null = null,
): LineageRow {
  return { id, parent_id, mode, venuePublicId };
}

describe("isOwnVenuePublicId", () => {
  it("accepts only the caller's own venue folder", () => {
    expect(isOwnVenuePublicId("zaffa-venues/u1/hall", "u1")).toBe(true);
    expect(isOwnVenuePublicId("zaffa-venues/u2/hall", "u1")).toBe(false);
    // A prefix match on the user id is not ownership.
    expect(isOwnVenuePublicId("zaffa-venues/u10/hall", "u1")).toBe(false);
    expect(isOwnVenuePublicId("zaffa-references/u1/hall", "u1")).toBe(false);
  });
});

describe("findDressVenueAncestor", () => {
  it("finds the dress-venue root of a chain of talked edits", () => {
    const rows = [
      row("a", null, "dress_venue", PHOTO.publicId),
      row("b", "a", "refine"),
      row("c", "b", "refine"),
    ];
    expect(findDressVenueAncestor("c", rows)?.id).toBe("a");
    expect(findDressVenueAncestor("a", rows)?.id).toBe("a");
  });

  it("is null for a prompt-only render and its edits, or a render with no meta", () => {
    const rows = [row("a", null, "generate"), row("b", "a", "refine"), row("x", null, null)];
    expect(findDressVenueAncestor("b", rows)).toBeNull();
    expect(findDressVenueAncestor("x", rows)).toBeNull();
    expect(findDressVenueAncestor("missing", rows)).toBeNull();
  });

  it("stops on a parent loop instead of spinning", () => {
    const rows = [row("a", "b", "refine"), row("b", "a", "refine")];
    expect(findDressVenueAncestor("a", rows)).toBeNull();
  });
});

describe("compareBeforePhoto", () => {
  const rows = [row("a", null, "dress_venue", PHOTO.publicId), row("b", "a", "refine")];

  it("is the design's photo for a render dressed from it", () => {
    expect(compareBeforePhoto("b", rows, PHOTO)).toBe(PHOTO);
  });

  it("is null once the photo on the design is not the one that was dressed", () => {
    const replaced = { ...PHOTO, publicId: "zaffa-venues/u1/garden" };
    expect(compareBeforePhoto("b", rows, replaced)).toBeNull();
  });

  it("is null with no photo, no render, or a render that dressed nothing", () => {
    expect(compareBeforePhoto("b", rows, null)).toBeNull();
    expect(compareBeforePhoto(null, rows, PHOTO)).toBeNull();
    expect(compareBeforePhoto("g", [row("g", null, "generate")], PHOTO)).toBeNull();
  });

  it("trusts a dress-venue row that predates the recorded public id", () => {
    expect(compareBeforePhoto("a", [row("a", null, "dress_venue")], PHOTO)).toBe(PHOTO);
  });
});
