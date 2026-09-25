import { beforeEach, describe, expect, it, vi } from "vitest";

// F1: the dress-venue prompt and the call it makes. The prompt is the whole
// product here: the first couple who uploaded their lawn got a generic
// meadow because the old prompt told the model every image was "strictly a
// mood reference". These pin that the venue is Image 1 and is kept, that
// the old clause never comes back for it, and that the guest count still
// sizes the decor. image-gen is mocked; no model is ever called.

const generateImage = vi.fn();
const generateImageViaImagesApi = vi.fn();
vi.mock("@/server/ai/image-gen", () => ({
  generateImage: (...args: unknown[]) => generateImage(...args),
  generateImageViaImagesApi: (...args: unknown[]) =>
    generateImageViaImagesApi(...args),
  venueImageModel: () => ({
    model: "openai/gpt-image-2.5-sunburst",
    quality: "high",
  }),
}));

const {
  buildDressVenuePrompt,
  dressVenueScene,
  renderScene,
  MAX_DRESS_VENUE_MOOD_REFERENCES,
} = await import("@/server/ai/scene-generator");

type Category =
  | "overall_vibe"
  | "tables"
  | "flowers"
  | "lighting"
  | "venue_decor";

function ref(category: Category, n: number) {
  return { url: `https://res.cloudinary.com/demo/${category}-${n}.jpg`, category };
}

const INPUT = {
  eventType: "wedding",
  setting: "outdoor",
  size: "large",
  guestCount: 300,
  palette: { name: "ivory", colors: ["#ffffff", "#d4af37"] },
  references: [] as ReturnType<typeof ref>[],
  styleNotes: "ورد أبيض كتير وإضاءة دافية",
};

const VENUE = { url: "https://res.cloudinary.com/demo/image/upload/s--sig--/c_limit,h_1536,w_1536/zaffa-venues/u1/lawn.jpg" };

beforeEach(() => {
  vi.clearAllMocks();
  const result = {
    imageUrl: "https://res.cloudinary.com/demo/zaffa-renders/out.png",
    publicId: "zaffa-renders/out",
    text: null,
    model: "openai/gpt-image-2.5-sunburst",
    costUsd: 0.057,
  };
  generateImage.mockResolvedValue({ ...result, model: "google/gemini-3-pro-image-preview" });
  generateImageViaImagesApi.mockResolvedValue(result);
});

describe("buildDressVenuePrompt", () => {
  it("makes Image 1 the couple's venue and keeps its architecture and camera", () => {
    const prompt = buildDressVenuePrompt(INPUT, []);
    expect(prompt).toMatch(/^Image 1 is a photograph of the couple's real venue/);
    for (const kept of [
      "walls",
      "ceiling",
      "columns",
      "floor",
      "trees",
      "palms",
      "lawn shape",
      "hedges",
      "horizon",
      "windows",
    ]) {
      expect(prompt).toContain(kept);
    }
    expect(prompt).toMatch(/camera position, height, lens, perspective and framing exactly the same/);
    expect(prompt).toMatch(/Remove only temporary clutter: boxes, plastic chairs, bags, cleaning tools/);
  });

  it("never carries the old 'strictly a mood reference' clause, nor the forced frame and camera", () => {
    const prompt = buildDressVenuePrompt(INPUT, [ref("flowers", 1), ref("tables", 1)]);
    expect(prompt).not.toMatch(/strictly as a stylistic mood reference/i);
    expect(prompt).not.toMatch(/16:9/);
    expect(prompt).not.toMatch(/24-28mm/);
    expect(prompt).not.toMatch(/enclosed reception hall|open-air outdoor venue/);
  });

  it("sizes the decor for the couple's guest count", () => {
    expect(buildDressVenuePrompt(INPUT, [])).toContain("about 300 guests");
    expect(buildDressVenuePrompt({ ...INPUT, guestCount: 40 }, [])).toContain(
      "about 40 guests",
    );
    // No count: the coarse bucket, as the prompt-only render does.
    expect(
      buildDressVenuePrompt({ ...INPUT, guestCount: null, size: "intimate" }, []),
    ).toContain("about 30 guests");
  });

  it("numbers mood references from Image 2 and applies them to style only", () => {
    const prompt = buildDressVenuePrompt(INPUT, [
      ref("overall_vibe", 1),
      ref("flowers", 1),
      ref("flowers", 2),
    ]);
    expect(prompt).toContain("- Image 2: overall vibe and mood.");
    expect(prompt).toContain("- Images 3, 4: florals");
    expect(prompt).not.toContain("- Image 1:");
    expect(prompt).toMatch(/never copy their rooms, architecture, backgrounds or layouts/);
  });

  it("says nothing about references when there are none (the venue alone is enough)", () => {
    const prompt = buildDressVenuePrompt(INPUT, []);
    expect(prompt).not.toMatch(/mood references/);
  });

  it("carries the palette, the intake brief when there is one, and the raw notes either way", () => {
    const withNotes = buildDressVenuePrompt(INPUT, []);
    expect(withNotes).toContain("#ffffff, #d4af37 (ivory)");
    expect(withNotes).toContain(INPUT.styleNotes);
    expect(withNotes).not.toMatch(/Design brief/);
    // F3: the brief is the model's clean English reading of the notes. It
    // leads, and the notes stay, because a detail the brief lost is still
    // in the couple's own words.
    const withBrief = buildDressVenuePrompt(
      { ...INPUT, briefEn: "Lots of white roses and warm lights." },
      [],
    );
    expect(withBrief).toContain(
      "Design brief, normalised from the couple's own words: Lots of white roses and warm lights.",
    );
    expect(withBrief).toContain(INPUT.styleNotes);
    expect(withBrief.indexOf("Design brief")).toBeLessThan(
      withBrief.indexOf(INPUT.styleNotes),
    );
  });

  it("forbids people, text and watermarks, and asks for one photograph", () => {
    const prompt = buildDressVenuePrompt(INPUT, []);
    expect(prompt).toMatch(/NO people/);
    expect(prompt).toMatch(/No text/);
    expect(prompt).toMatch(/watermarks/);
    expect(prompt).toMatch(/Output exactly one photograph/);
  });

  it("contains no em or en dashes", () => {
    const prompt = buildDressVenuePrompt(
      { ...INPUT, styleNotes: "" },
      [ref("lighting", 1)],
    );
    expect(prompt).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("dressVenueScene", () => {
  it("sends the venue first, then at most four mood references in category order", async () => {
    await dressVenueScene(
      {
        ...INPUT,
        references: [
          ref("venue_decor", 1),
          ref("lighting", 1),
          ref("flowers", 1),
          ref("tables", 1),
          ref("overall_vibe", 1),
          ref("overall_vibe", 2),
        ],
      },
      VENUE,
    );
    expect(generateImage).not.toHaveBeenCalled();
    expect(generateImageViaImagesApi).toHaveBeenCalledTimes(1);
    const call = generateImageViaImagesApi.mock.calls[0][0];
    expect(call.references).toEqual([
      { url: VENUE.url },
      { url: ref("overall_vibe", 1).url },
      { url: ref("overall_vibe", 2).url },
      { url: ref("tables", 1).url },
      { url: ref("flowers", 1).url },
    ]);
    expect(call.references).toHaveLength(1 + MAX_DRESS_VENUE_MOOD_REFERENCES);
    expect(call).toMatchObject({
      model: "openai/gpt-image-2.5-sunburst",
      quality: "high",
      aspectRatio: "auto",
      mode: "dress_venue",
      cloudinaryFolder: "zaffa-renders",
    });
    // The prompt it sent numbers the same four as Images 2..5.
    expect(call.prompt).toContain("Images 2, 3: overall vibe");
    expect(call.prompt).toContain("Image 5: florals");
  });

  it("dresses the venue with no mood references at all", async () => {
    await dressVenueScene({ ...INPUT, references: [] }, VENUE);
    expect(generateImageViaImagesApi.mock.calls[0][0].references).toEqual([
      { url: VENUE.url },
    ]);
  });
});

describe("renderScene (prompt-only) is unchanged", () => {
  it("still uses the chat path with every reference as a mood reference", async () => {
    await renderScene({ ...INPUT, references: [ref("flowers", 1)] });
    expect(generateImageViaImagesApi).not.toHaveBeenCalled();
    const call = generateImage.mock.calls[0][0];
    expect(call.mode).toBe("generate");
    expect(call.prompt).toMatch(/strictly as a stylistic mood reference/);
    expect(call.prompt).toContain("- Image 1: florals");
  });

  it("carries the intake brief next to the raw notes (F3)", async () => {
    await renderScene({
      ...INPUT,
      briefEn: "A secret garden: white roses, crystal chandeliers hung in the trees.",
    });
    const prompt: string = generateImage.mock.calls[0][0].prompt;
    expect(prompt).toContain(
      "Design brief, normalised from the couple's own words: A secret garden: white roses, crystal chandeliers hung in the trees.",
    );
    expect(prompt).toContain(
      `Additional notes from the host (incorporate where they fit): ${INPUT.styleNotes}`,
    );
  });

  it("says nothing about a brief when there is none", async () => {
    await renderScene({ ...INPUT, briefEn: "   " });
    const prompt: string = generateImage.mock.calls[0][0].prompt;
    expect(prompt).not.toMatch(/Design brief/);
    expect(prompt).toContain(INPUT.styleNotes);
  });
});
