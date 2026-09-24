import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  canSendRender,
  designIdForRender,
} from "@/components/venue-designer/dashboard/render-design-id";

// The render panel flushes the design save before `ai.renderScene`, and the
// server refuses the whole render when the id it is sent is not the
// caller's design. A failed save is how a stale id shows itself (the
// anonymous user behind it was cleaned up, or the link was opened in
// another browser), so a failed save must not send the old id again.

describe("designIdForRender", () => {
  it("sends the id the save resolved with, a new design's included", async () => {
    const id = randomUUID();
    await expect(designIdForRender(async () => id)).resolves.toBe(id);
  });

  it("sends no id when the save fails, so the render still goes ahead", async () => {
    const saveNow = vi.fn(async (): Promise<string> => {
      throw new Error("P2025: Record to update not found");
    });
    await expect(designIdForRender(saveNow)).resolves.toBeNull();
    expect(saveNow).toHaveBeenCalledTimes(1);
  });
});

describe("canSendRender", () => {
  // Only the saved design tells the server which venue photo to dress, so
  // a venue render without a design id would be an imagined hall.
  it("holds a venue render back until there is a design id", () => {
    expect(canSendRender(null, true)).toBe(false);
    expect(canSendRender(randomUUID(), true)).toBe(true);
  });

  it("lets a render without a venue photo go ahead either way", () => {
    expect(canSendRender(null, false)).toBe(true);
    expect(canSendRender(randomUUID(), false)).toBe(true);
  });
});
