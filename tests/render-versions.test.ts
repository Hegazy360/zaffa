import { describe, expect, it } from "vitest";
import {
  buildRenderVersions,
  withPendingVersions,
  type VersionMedia,
} from "@/components/venue-designer/dashboard/render-versions";

// F2: what the version strip calls each render. Oldest first, whatever
// order the design read returns them in (getById is newest first); roots
// are "Original" or "Your venue", numbered only when there are several;
// changes are numbered in the order they were made and captioned with what
// the couple typed.

let clock = Date.parse("2026-09-23T10:00:00Z");
function row(
  id: string,
  opts: {
    type?: string;
    parent?: string | null;
    mode?: "generate" | "dress_venue" | "refine" | null;
    instruction?: string;
    confirmation?: string;
    at?: number;
  } = {},
): VersionMedia {
  clock += 60_000;
  return {
    id,
    type: opts.type ?? "render",
    url: `https://cdn.example/${id}.png`,
    parent_id: opts.parent ?? null,
    created_at: new Date(opts.at ?? clock).toISOString(),
    meta:
      opts.mode === null
        ? null
        : {
            mode: opts.mode ?? "generate",
            instructionRaw: opts.instruction ?? null,
            confirmation: opts.confirmation ?? null,
            venuePublicId: null,
          },
  };
}

describe("buildRenderVersions", () => {
  it("orders oldest first and labels a single original and its changes", () => {
    const original = row("a");
    const first = row("b", { parent: "a", mode: "refine", instruction: "more roses", confirmation: "Done: more roses." });
    const second = row("c", { parent: "b", mode: "refine", instruction: "  gold chairs " });
    // As getById returns them: newest first.
    const versions = buildRenderVersions([second, first, original]);
    expect(versions.map((v) => v.id)).toEqual(["a", "b", "c"]);
    expect(versions.map((v) => v.label)).toEqual([
      { kind: "original", n: 1, numbered: false },
      { kind: "change", n: 1 },
      { kind: "change", n: 2 },
    ]);
    expect(versions.map((v) => v.caption)).toEqual([null, "more roses", "gold chairs"]);
    expect(versions[1].confirmation).toBe("Done: more roses.");
    expect(versions[2].parentId).toBe("b");
  });

  it("calls a dressed venue 'venue', and numbers roots only when there are several", () => {
    const versions = buildRenderVersions([
      row("v1", { mode: "dress_venue" }),
      row("g1"),
      row("g2"),
      row("ch", { parent: "v1", mode: "refine", instruction: "candles" }),
    ]);
    expect(versions.map((v) => v.label)).toEqual([
      { kind: "venue", n: 1, numbered: false },
      { kind: "original", n: 1, numbered: true },
      { kind: "original", n: 2, numbered: true },
      { kind: "change", n: 1 },
    ]);
  });

  it("leaves videos out and treats a render with a parent as a change even without meta", () => {
    const versions = buildRenderVersions([
      row("vid", { type: "video", parent: "r" }),
      row("child", { parent: "r", mode: null }),
      row("r", { mode: null, at: Date.parse("2026-09-01T00:00:00Z") }),
    ]);
    expect(versions.map((v) => [v.id, v.label.kind])).toEqual([
      ["r", "original"],
      ["child", "change"],
    ]);
    // No meta, no caption: nothing invented.
    expect(versions[1].caption).toBeNull();
  });

  it("keeps rows written in the same millisecond in the order they were written", () => {
    const at = Date.parse("2026-09-23T12:00:00Z");
    const versions = buildRenderVersions([
      row("second", { parent: "first", mode: "refine", at }),
      row("first", { at }),
    ]);
    expect(versions.map((v) => v.id)).toEqual(["first", "second"]);
  });
});

describe("withPendingVersions", () => {
  it("adds a change the refetch has not brought back yet, once", () => {
    const fetched = [row("a")];
    const pending = [row("b", { parent: "a", mode: "refine" })];
    expect(withPendingVersions(fetched, pending).map((m) => m.id)).toEqual(["a", "b"]);
    // After the refetch the row is there, and not twice.
    expect(
      withPendingVersions([...fetched, pending[0]], pending).map((m) => m.id),
    ).toEqual(["a", "b"]);
  });
});
