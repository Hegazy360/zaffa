import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildDesignBrief, type BriefDesignInput } from "@/lib/design-brief";
import { computeDecorPlan } from "@/lib/decor-pricing";
import type { DecorAnalysis } from "@/lib/decor-analysis";

const ANALYSIS: DecorAnalysis = {
  table_shape: "long",
  centerpiece: "tall",
  has_stage: true,
  has_arch: false,
  has_entrance_decor: true,
  has_dance_floor: true,
  has_draping: false,
  has_chandeliers: false,
  has_string_lights: true,
  candle_density: "lots",
  floral_density: "lush",
  flowers: ["rose", "baby_breath"],
  linens: "runner_only",
  chair_style: "cross_back",
  questions: ["Can the lights hang from the palms?"],
};

const at = (iso: string) => new Date(iso);
const V1 = randomUUID();
const V2 = randomUUID();
const V3 = randomUUID();
const PHOTO = {
  url: "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-venues/u/lawn.jpg",
  publicId: "zaffa-venues/u/lawn",
  width: 2048,
  height: 1536,
};

function design(overrides: Partial<BriefDesignInput> = {}): BriefDesignInput {
  return {
    guest_count: 180,
    size: "large",
    setting: "outdoor",
    palette: { name: "White and gold", colors: ["#ffffff", "#d4af37", "not-a-colour"] },
    style_notes: "  عايزين فرح عائلي، ورد أبيض كتير وإضاءة دافية  ",
    venue_photo: PHOTO,
    selected_media_id: null,
    // Deliberately out of order: the brief numbers by creation time.
    media: [
      {
        id: V3,
        url: "https://res.cloudinary.com/zaffa/v3.jpg",
        parent_id: V2,
        created_at: at("2026-09-22T12:00:00Z"),
        meta: {
          mode: "refine",
          instructionRaw: "كبروا الكوشة",
          instructionEn: "Make the stage larger",
          costUsd: 0.022,
          model: "openai/gpt-image-2.5-flare",
        },
      },
      {
        id: V1,
        url: "https://res.cloudinary.com/zaffa/v1.jpg",
        parent_id: null,
        created_at: at("2026-09-20T10:00:00Z"),
        meta: { mode: "generate", briefEn: "A family garden wedding, white roses" },
      },
      {
        id: V2,
        url: "https://res.cloudinary.com/zaffa/v2.jpg",
        parent_id: null,
        created_at: at("2026-09-21T10:00:00Z"),
        meta: {
          mode: "dress_venue",
          venuePublicId: PHOTO.publicId,
          decor: { ...ANALYSIS, locale: "ar", analyzedAt: "2026-09-21T11:00:00Z" },
        },
      },
    ],
    ...overrides,
  };
}

describe("buildDesignBrief", () => {
  it("numbers every version in the order it was made, with what was asked", () => {
    const brief = buildDesignBrief(design(), { country: "EG" });
    expect(brief.versions.map((v) => [v.number, v.id])).toEqual([
      [1, V1],
      [2, V2],
      [3, V3],
    ]);
    expect(brief.versions[2]).toMatchObject({
      mode: "refine",
      parentNumber: 2,
      instruction: "كبروا الكوشة",
      instructionEn: "Make the stage larger",
    });
    // The brief never carries what we pay per image.
    expect(JSON.stringify(brief)).not.toContain("costUsd");
    expect(JSON.stringify(brief)).not.toContain("gpt-image");
  });

  it("quotes the version the couple chose, and says it was their choice", () => {
    const brief = buildDesignBrief(design({ selected_media_id: V2 }), { country: "EG" });
    expect(brief.selected).toMatchObject({ id: V2, number: 2, pinned: true });
    expect(brief.versions.filter((v) => v.selected).map((v) => v.id)).toEqual([V2]);
  });

  it("falls back to the newest version, marked as not chosen", () => {
    const brief = buildDesignBrief(design(), { country: "EG" });
    expect(brief.selected).toMatchObject({ id: V3, number: 3, pinned: false });
  });

  it("ignores a pin that is not one of this design's renders", () => {
    const brief = buildDesignBrief(design({ selected_media_id: randomUUID() }), {
      country: "EG",
    });
    expect(brief.selected).toMatchObject({ id: V3, pinned: false });
  });

  it("prices the chosen render from its cached analysis, in the lead's market", () => {
    const brief = buildDesignBrief(design({ selected_media_id: V2 }), { country: "AE" });
    const expected = computeDecorPlan(ANALYSIS, {
      guestCount: 180,
      size: "large",
      setting: "outdoor",
      market: "AE",
    });
    expect(brief.plan).toEqual({
      market: "AE",
      currency: "AED",
      lo: expected.totals.lo,
      hi: expected.totals.hi,
      guestCount: 180,
      guestCountAssumed: false,
      tables: expected.tables,
      items: expected.items.length,
    });
    expect(brief.planNeedsAnalysis).toBe(false);
  });

  it("has no plan, and says so, when the chosen render was never read", () => {
    const brief = buildDesignBrief(design({ selected_media_id: V1 }), { country: "EG" });
    expect(brief.plan).toBeNull();
    expect(brief.planNeedsAnalysis).toBe(true);
  });

  it("puts the venue photo next to the render that dressed it", () => {
    const brief = buildDesignBrief(design(), { country: "EG" });
    expect(brief.venue).toEqual({
      photoUrl: PHOTO.url,
      dressed: { url: "https://res.cloudinary.com/zaffa/v2.jpg", number: 2 },
    });
  });

  it("still shows a venue photo no render has dressed", () => {
    const media = design().media.filter((m) => m.id !== V2);
    const brief = buildDesignBrief(design({ media }), { country: "EG" });
    expect(brief.venue).toEqual({ photoUrl: PHOTO.url, dressed: null });
  });

  it("keeps palette hexes only, trims the notes and finds the English brief", () => {
    const brief = buildDesignBrief(design(), { country: "EG" });
    expect(brief.palette).toEqual({ name: "White and gold", colors: ["#ffffff", "#d4af37"] });
    expect(brief.styleNotes).toBe("عايزين فرح عائلي، ورد أبيض كتير وإضاءة دافية");
    expect(brief.briefEn).toBe("A family garden wedding, white roses");
  });

  it("copes with a design that has no render, palette or venue", () => {
    const brief = buildDesignBrief(
      design({ media: [], palette: null, venue_photo: null, style_notes: null }),
      { country: null },
    );
    expect(brief).toMatchObject({
      selected: null,
      versions: [],
      venue: null,
      palette: { name: null, colors: [] },
      styleNotes: null,
      briefEn: null,
      plan: null,
      planNeedsAnalysis: false,
    });
  });
});
