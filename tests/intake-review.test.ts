import { describe, expect, it } from "vitest";
import {
  buildIntakeRequest,
  conflictKey,
  venueCandidates,
  type IntakeState,
} from "@/components/venue-designer/dashboard/intake-review";
import { EMPTY_REFERENCES, type Ref } from "@/types/venue-designer";

// F3, the client's side of the intake check: what it is asked, and which
// venue candidates the card may offer. An index in the answer has to mean
// the same image to the check, the card and the render, so the request
// orders and caps references exactly like the render does.

function ref(id: string, source: Ref["source"] = "upload"): Ref {
  return { id, url: `https://res.cloudinary.com/zaffa/image/upload/v1/${id}.jpg`, source };
}

const STATE: IntakeState = {
  eventType: "wedding",
  setting: "indoor",
  guestCount: 120,
  palette: { name: "Blush", colors: ["#f4c2c2"] },
  references: { ...EMPTY_REFERENCES },
  styleNotes: "  garden party  ",
  hasVenuePhoto: false,
  locale: "en",
};

describe("buildIntakeRequest", () => {
  it("asks nothing when there are no notes, references or venue photo", () => {
    expect(buildIntakeRequest({ ...STATE, styleNotes: " " })).toBeNull();
    expect(buildIntakeRequest({ ...STATE, styleNotes: "", hasVenuePhoto: true })).not.toBeNull();
  });

  it("orders references like the render does, capped at ten, and remembers which is which", () => {
    const request = buildIntakeRequest({
      ...STATE,
      references: {
        overall_vibe: [ref("v1"), ref("v2"), ref("v3")],
        tables: [ref("t1"), ref("t2"), ref("t3")],
        flowers: [ref("f1"), ref("f2"), ref("f3")],
        lighting: [ref("l1"), ref("l2")],
        venue_decor: [ref("d1")],
      },
    })!;
    expect(request.input.references).toHaveLength(10);
    expect(request.slots.map((s) => s.id)).toEqual([
      "v1", "v2", "v3", "t1", "t2", "t3", "f1", "f2", "f3", "l1",
    ]);
    expect(request.input.references[3]).toEqual({ url: ref("t1").url, category: "tables" });
    expect(request.input.styleNotes).toBe("garden party");
  });

  it("gives the same inputs the same key, and a new key for any change or language", () => {
    const a = buildIntakeRequest(STATE)!;
    expect(buildIntakeRequest({ ...STATE })!.key).toBe(a.key);
    expect(buildIntakeRequest({ ...STATE, setting: "outdoor" })!.key).not.toBe(a.key);
    expect(buildIntakeRequest({ ...STATE, guestCount: null })!.key).not.toBe(a.key);
    expect(buildIntakeRequest({ ...STATE, locale: "ar" })!.key).not.toBe(a.key);
    // Whitespace around the notes is not a change.
    expect(buildIntakeRequest({ ...STATE, styleNotes: "garden party" })!.key).toBe(a.key);
  });
});

describe("conflictKey", () => {
  it("names a setting conflict by its fix, any other by its words", () => {
    expect(
      conflictKey({ kind: "setting", message: "one wording", suggestedSetting: "outdoor" }),
    ).toBe(conflictKey({ kind: "setting", message: "another", suggestedSetting: "outdoor" }));
    expect(conflictKey({ kind: "notes", message: "a", suggestedSetting: null })).not.toBe(
      conflictKey({ kind: "notes", message: "b", suggestedSetting: null }),
    );
  });
});

describe("venueCandidates", () => {
  const references = {
    ...EMPTY_REFERENCES,
    overall_vibe: [ref("pin", "pinterest"), ref("lib", "inspiration")],
    venue_decor: [ref("lawn")],
  };
  const cached = (indexes: number[]) => ({
    result: {
      summary: "s",
      briefEn: "",
      conflicts: [],
      venueCandidateIndexes: indexes,
      notesSetting: "unclear" as const,
    },
    slots: [
      { id: "pin", category: "overall_vibe" as const },
      { id: "lib", category: "overall_vibe" as const },
      { id: "lawn", category: "venue_decor" as const },
      { id: "gone", category: "tables" as const },
    ],
  });

  it("offers only the couple's own uploads that are still on the design", () => {
    const out = venueCandidates(cached([0, 1, 2, 3, 7]), references, new Set());
    expect(out.map((c) => c.ref.id)).toEqual(["lawn"]);
    expect(out[0].category).toBe("venue_decor");
  });

  it("leaves out the ones the couple said are inspiration", () => {
    expect(venueCandidates(cached([2]), references, new Set(["lawn"]))).toEqual([]);
  });
});
