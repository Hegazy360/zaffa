import { describe, expect, it } from "vitest";
import {
  findLandedRender,
  renderMayHaveLanded,
  renderOutcomeUnknown,
} from "@/components/venue-designer/dashboard/render-recovery";

// A render whose response never reached the tab may still have been
// written and paid for (the server carries on when a phone suspends the
// tab mid-minute). These pin which failures count as "maybe it landed" and
// how the panel tells the landed render from the ones it already knew.

const LOST = { data: undefined };
const REFUSED = { data: { code: "FORBIDDEN", httpStatus: 403 } };
const FAULTED = { data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } };

describe("renderOutcomeUnknown", () => {
  it("is true only when no tRPC answer came back", () => {
    expect(renderOutcomeUnknown(LOST)).toBe(true);
    expect(renderOutcomeUnknown({ data: null })).toBe(true);
    expect(renderOutcomeUnknown(undefined)).toBe(true);
    expect(renderOutcomeUnknown(REFUSED)).toBe(false);
    expect(renderOutcomeUnknown(FAULTED)).toBe(false);
  });
});

describe("renderMayHaveLanded", () => {
  it("covers a lost answer and a server fault, not a refusal", () => {
    expect(renderMayHaveLanded(LOST)).toBe(true);
    expect(renderMayHaveLanded(FAULTED)).toBe(true);
    expect(renderMayHaveLanded({ data: { code: "BAD_GATEWAY", httpStatus: 502 } })).toBe(true);
    expect(renderMayHaveLanded(REFUSED)).toBe(false);
    expect(renderMayHaveLanded({ data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } })).toBe(false);
  });
});

describe("findLandedRender", () => {
  const old = { id: "old", type: "render" };
  const video = { id: "vid", type: "video" };
  const landed = { id: "new", type: "render" };

  it("returns the newest render that was not there at the click", () => {
    expect(findLandedRender([landed, video, old], new Set(["old", "vid"]))).toBe(landed);
  });

  it("ignores videos and renders it already knew", () => {
    expect(findLandedRender([video, old], new Set(["old"]))).toBeNull();
  });

  it("takes any render on a design that had none", () => {
    expect(findLandedRender([landed], new Set())).toBe(landed);
  });
});
