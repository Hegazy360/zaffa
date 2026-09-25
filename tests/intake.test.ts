import { beforeEach, describe, expect, it, vi } from "vitest";

// F3, "Before we render": the intake check's reading of the couple's brief.
// What must hold:
//  - the model only ever sees images from hosts we trust, our own as a
//    thumbnail built from the public id, never the URL the client sent;
//  - the notes-say-garden, setting-says-indoor mismatch that cost a real
//    couple their free render is always a conflict with a one-tap fix, even
//    when the model notices it and forgets to list it;
//  - what reaches the couple is tidy (no dashes, bounded) and the venue
//    candidates are images the model was actually shown.
// The text model and Cloudinary are mocked; nothing is called.

vi.mock("server-only", () => ({}));

const chatCompletionJson = vi.fn();
vi.mock("@/server/llm/openrouter", () => ({
  chatCompletionJson: (...args: unknown[]) => chatCompletionJson(...args),
}));

vi.mock("@/lib/cloudinary", () => ({
  intakeThumbUrl: (publicId: string) => `https://thumb.example/${publicId}.jpg`,
}));

const { intakeImageUrl, checkIntake, finaliseIntake, IntakeUnreadable, INTAKE_BRIEF_MAX } =
  await import("@/server/ai/intake");

const CLOUD = "zaffa-test-cloud";
const OWN = (id: string) => `https://res.cloudinary.com/${CLOUD}/image/upload/v1712/zaffa-references/u1/${id}.jpg`;

type Input = Parameters<typeof checkIntake>[0];

const INPUT: Input = {
  eventType: "wedding",
  setting: "indoor",
  guestCount: 180,
  palette: { name: "Ivory and gold", colors: ["#fdf8f0", "#d4af37"] },
  styleNotes: "Secret garden, chandeliers hanging from the trees, fairy lights",
  references: [],
  hasVenuePhoto: false,
  venuePhotoEnabled: true,
  locale: "en",
};

function answer(overrides: Record<string, unknown> = {}) {
  return {
    summary: "An outdoor secret garden for 180 guests in ivory and gold.",
    briefEn: "Secret garden reception: crystal chandeliers hung from the trees, fairy lights.",
    notesSetting: "unclear",
    conflicts: [],
    venueCandidateIndexes: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  chatCompletionJson.mockResolvedValue(answer());
});

describe("intakeImageUrl", () => {
  it("sends our own uploads as a thumbnail built from the public id", () => {
    expect(intakeImageUrl(OWN("lawn"))).toBe(
      "https://thumb.example/zaffa-references/u1/lawn.jpg",
    );
  });

  it("resizes Unsplash through its own parameters and keeps Pinterest as is", () => {
    const unsplash = new URL(
      intakeImageUrl("https://images.unsplash.com/photo-123?ixid=abc&w=4000")!,
    );
    expect(unsplash.hostname).toBe("images.unsplash.com");
    expect(unsplash.searchParams.get("w")).toBe("512");
    expect(unsplash.searchParams.get("fm")).toBe("jpg");
    expect(unsplash.searchParams.get("ixid")).toBe("abc");
    expect(intakeImageUrl("https://i.pinimg.com/736x/aa/bb/cc.jpg")).toBe(
      "https://i.pinimg.com/736x/aa/bb/cc.jpg",
    );
  });

  it.each([
    ["another host", "https://evil.example/lawn.jpg"],
    ["plain http", "http://images.unsplash.com/photo-1"],
    ["another Cloudinary account", "https://res.cloudinary.com/someone/image/upload/v1/x.jpg"],
    [
      "our account with a transformation",
      `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_10/v1/zaffa-references/u1/x.jpg`,
    ],
    ["a data URL", "data:image/png;base64,AAAA"],
    ["not a URL", "lawn.jpg"],
    ["a link-local address", "https://169.254.169.254/latest/meta-data"],
  ])("leaves out %s", (_label, url) => {
    expect(intakeImageUrl(url)).toBeNull();
  });
});

describe("checkIntake", () => {
  it("shows the model only the trusted images, labelled with their index in the request", async () => {
    await checkIntake({
      ...INPUT,
      references: [
        { url: OWN("vibe"), category: "overall_vibe" },
        { url: "https://evil.example/x.jpg", category: "tables" },
        { url: OWN("lawn"), category: "venue_decor" },
      ],
    });
    const args = chatCompletionJson.mock.calls[0][0];
    expect(args.temperature).toBe(0.2);
    expect(args.jsonSchema.name).toBe("intake_check");
    const user = args.messages[1].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    const images = user.filter((p) => p.type === "image_url").map((p) => p.image_url!.url);
    expect(images).toEqual([
      "https://thumb.example/zaffa-references/u1/vibe.jpg",
      "https://thumb.example/zaffa-references/u1/lawn.jpg",
    ]);
    const labels = user.filter((p) => p.type === "text").map((p) => p.text);
    expect(labels).toContain("Reference index 0 (category: overall_vibe):");
    expect(labels).toContain("Reference index 2 (category: venue_decor):");
    expect(labels.join("\n")).not.toContain("Reference index 1");
    expect(user[0].text).toContain("Setting chosen: indoor.");
    expect(user[0].text).toContain("Guest count: 180.");
    expect(user[0].text).toContain(INPUT.styleNotes);
  });

  it("asks for the couple's language and voice, and forbids dashes", async () => {
    await checkIntake({ ...INPUT, locale: "ar" });
    const system: string = chatCompletionJson.mock.calls[0][0].messages[0].content;
    expect(system).toContain("in Arabic");
    expect(system).toContain("Egyptian colloquial");
    expect(system).toContain("Never use em dashes or en dashes");
    expect(system).not.toMatch(/[–—]/);
  });

  it("tells the model there are no venue candidates once the couple has a venue photo", async () => {
    await checkIntake({ ...INPUT, hasVenuePhoto: true });
    const system: string = chatCompletionJson.mock.calls[0][0].messages[0].content;
    expect(system).toContain("already added a photo of their venue");
  });

  it("throws, rather than inventing a card, when the answer is unusable", async () => {
    chatCompletionJson.mockResolvedValueOnce({ nope: true });
    await expect(checkIntake(INPUT)).rejects.toBeInstanceOf(IntakeUnreadable);
    chatCompletionJson.mockResolvedValueOnce(answer({ summary: "   " }));
    await expect(checkIntake(INPUT)).rejects.toBeInstanceOf(IntakeUnreadable);
    chatCompletionJson.mockRejectedValueOnce(new Error("LLM 402"));
    await expect(checkIntake(INPUT)).rejects.toThrow("LLM 402");
  });
});

describe("finaliseIntake", () => {
  const parse = (a: Record<string, unknown>) =>
    a as unknown as Parameters<typeof finaliseIntake>[0];

  it("adds the setting conflict the model noticed but did not list", () => {
    const out = finaliseIntake(parse(answer({ notesSetting: "outdoor" })), INPUT, []);
    expect(out.conflicts).toEqual([
      { kind: "setting", message: null, suggestedSetting: "outdoor" },
    ]);
    expect(out.notesSetting).toBe("outdoor");
  });

  it("adds nothing when the notes agree with the setting or say nothing", () => {
    expect(
      finaliseIntake(parse(answer({ notesSetting: "indoor" })), INPUT, []).conflicts,
    ).toEqual([]);
    expect(
      finaliseIntake(parse(answer({ notesSetting: "unclear" })), INPUT, []).conflicts,
    ).toEqual([]);
    // No notes at all: whatever the model claims about them is ignored.
    const noNotes = finaliseIntake(
      parse(answer({ notesSetting: "outdoor" })),
      { ...INPUT, styleNotes: "  " },
      [],
    );
    expect(noNotes.notesSetting).toBe("unclear");
    expect(noNotes.conflicts).toEqual([]);
  });

  it("keeps the model's own wording and fills in the fix it left out", () => {
    const out = finaliseIntake(
      parse(
        answer({
          notesSetting: "outdoor",
          conflicts: [
            {
              kind: "setting",
              message: "Your notes describe a garden — but the setting is indoor.",
              suggestedSetting: "none",
            },
          ],
        }),
      ),
      INPUT,
      [],
    );
    expect(out.conflicts).toEqual([
      {
        kind: "setting",
        message: "Your notes describe a garden, but the setting is indoor.",
        suggestedSetting: "outdoor",
      },
    ]);
  });

  it("never suggests the setting already chosen, and keeps one setting conflict", () => {
    const out = finaliseIntake(
      parse(
        answer({
          conflicts: [
            { kind: "setting", message: "Same place twice.", suggestedSetting: "indoor" },
            { kind: "setting", message: "A second one.", suggestedSetting: "tent" },
          ],
        }),
      ),
      INPUT,
      [],
    );
    expect(out.conflicts).toEqual([
      { kind: "setting", message: "Same place twice.", suggestedSetting: null },
    ]);
  });

  it("only a setting conflict carries a fix, and there are at most three", () => {
    const out = finaliseIntake(
      parse(
        answer({
          conflicts: [
            { kind: "guest_count", message: "Notes say 300 guests.", suggestedSetting: "outdoor" },
            { kind: "notes", message: "Two palettes.", suggestedSetting: "none" },
            { kind: "other", message: "One.", suggestedSetting: "none" },
            { kind: "other", message: "Two.", suggestedSetting: "none" },
            { kind: "made_up", message: "Dropped.", suggestedSetting: "none" },
            { kind: "notes", message: "", suggestedSetting: "none" },
          ],
        }),
      ),
      INPUT,
      [],
    );
    expect(out.conflicts).toHaveLength(3);
    expect(out.conflicts.every((c) => c.suggestedSetting === null)).toBe(true);
    expect(out.conflicts[0]).toMatchObject({ kind: "guest_count" });
  });

  it("puts a missed setting conflict first even when the list is full", () => {
    const out = finaliseIntake(
      parse(
        answer({
          notesSetting: "tent",
          conflicts: [
            { kind: "notes", message: "A.", suggestedSetting: "none" },
            { kind: "notes", message: "B.", suggestedSetting: "none" },
            { kind: "notes", message: "C.", suggestedSetting: "none" },
          ],
        }),
      ),
      INPUT,
      [],
    );
    expect(out.conflicts).toHaveLength(3);
    expect(out.conflicts[0]).toEqual({ kind: "setting", message: null, suggestedSetting: "tent" });
  });

  it("keeps only venue candidates the model was shown, once each, in order", () => {
    const out = finaliseIntake(
      parse(answer({ venueCandidateIndexes: [4, 2, 2, 9, -1, 1.5, "3"] })),
      INPUT,
      [0, 2, 4],
    );
    expect(out.venueCandidateIndexes).toEqual([2, 4]);
  });

  it("offers no venue candidate once there is a venue photo, or with the feature off", () => {
    const a = parse(answer({ venueCandidateIndexes: [0] }));
    expect(finaliseIntake(a, { ...INPUT, hasVenuePhoto: true }, [0]).venueCandidateIndexes).toEqual([]);
    expect(
      finaliseIntake(a, { ...INPUT, venuePhotoEnabled: false }, [0]).venueCandidateIndexes,
    ).toEqual([]);
  });

  it("tidies what the couple reads and bounds the brief", () => {
    const out = finaliseIntake(
      parse(
        answer({
          summary: "A garden  –  for 180 guests.",
          briefEn: `${"white roses and candles ".repeat(60)}end`,
        }),
      ),
      INPUT,
      [],
    );
    expect(out.summary).toBe("A garden, for 180 guests.");
    expect(out.briefEn.length).toBeLessThanOrEqual(INTAKE_BRIEF_MAX);
    expect(out.briefEn.endsWith(" ")).toBe(false);
    expect(out.briefEn).not.toMatch(/candl$/);
  });
});
