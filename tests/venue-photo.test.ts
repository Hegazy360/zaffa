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

  // parent_id is ON DELETE SET NULL: deleting a version cuts the chain.
  it("keeps a change tied to the venue after the dressed root is deleted", () => {
    // "Your venue" deleted: Change 1 lost its parent, Change 2 still has one.
    const rows = [
      row("c1", null, "refine", PHOTO.publicId),
      row("c2", "c1", "refine", PHOTO.publicId),
    ];
    expect(findDressVenueAncestor("c2", rows)?.id).toBe("c1");
    expect(findDressVenueAncestor("c1", rows)?.id).toBe("c1");
  });

  it("keeps it when a change in the middle is deleted, or its parent is missing", () => {
    // Change 1 deleted: Change 2 lost its parent, Change 3 hangs off it.
    const rows = [
      row("v", null, "dress_venue", PHOTO.publicId),
      row("c2", null, "refine", PHOTO.publicId),
      row("c3", "c2", "refine", PHOTO.publicId),
      row("c4", "gone", "refine", PHOTO.publicId),
    ];
    expect(findDressVenueAncestor("c3", rows)?.id).toBe("c2");
    expect(findDressVenueAncestor("c4", rows)?.id).toBe("c4");
  });

  it("stands in with the oldest surviving change that recorded the venue", () => {
    const rows = [
      row("c1", null, "refine", PHOTO.publicId),
      row("c2", "c1", "refine", null),
      row("c3", "c2", "refine", "zaffa-venues/u1/garden"),
    ];
    expect(findDressVenueAncestor("c3", rows)?.id).toBe("c1");
  });

  it("does not invent a venue for a cut chain that never recorded one", () => {
    const rows = [row("c1", null, "refine"), row("c2", "c1", "refine")];
    expect(findDressVenueAncestor("c2", rows)).toBeNull();
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

  it("still shows the slider for a change whose dressed root was deleted", () => {
    const orphaned = [row("c1", null, "refine", PHOTO.publicId), row("c2", "c1", "refine")];
    expect(compareBeforePhoto("c2", orphaned, PHOTO)).toBe(PHOTO);
    // ...and still checks it against the photo the design holds now.
    const replaced = { ...PHOTO, publicId: "zaffa-venues/u1/garden" };
    expect(compareBeforePhoto("c2", orphaned, replaced)).toBeNull();
  });

  it("trusts a dress-venue row that predates the recorded public id", () => {
    expect(compareBeforePhoto("a", [row("a", null, "dress_venue")], PHOTO)).toBe(PHOTO);
  });
});
