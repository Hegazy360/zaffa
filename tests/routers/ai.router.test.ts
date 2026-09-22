import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// ai.renderScene writes the render's media row itself (F0). These tests pin
// the money-adjacent ordering: a foreign design is refused before anything
// is spent, the row carries its provenance, and a free-tier visitor whose
// row was written never gets the clean asset back. No model is ever called:
// renderScene, the quota helpers and Cloudinary are all mocked.

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const reportError = vi.fn();
vi.mock("@/lib/logger", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const trackServer = vi.fn();
vi.mock("@/lib/posthog", () => ({
  captureServer: vi.fn(),
  trackServer: (...args: unknown[]) => trackServer(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceTrpc: vi.fn(),
  enforceTrpcMany: vi.fn(),
  ipFromRequest: vi.fn(() => "1.2.3.4"),
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/cloudinary", () => ({
  watermarkedUrl: vi.fn((id: string) => `https://wm.example/${id}`),
}));

const renderScene = vi.fn();
vi.mock("@/server/ai/scene-generator", () => ({
  renderScene: (...args: unknown[]) => renderScene(...args),
}));
vi.mock("@/server/ai/video-generator", () => ({
  startVideoGeneration: vi.fn(),
  getVideoStatus: vi.fn(),
}));

const ensureFreePack = vi.fn();
const requireActivePack = vi.fn();
const consumeQuota = vi.fn();
vi.mock("@/server/routers/vision-packs", () => ({
  ensureFreePack: (...args: unknown[]) => ensureFreePack(...args),
  requireActivePack: (...args: unknown[]) => requireActivePack(...args),
  consumeQuota: (...args: unknown[]) => consumeQuota(...args),
}));

const { aiRouter } = await import("@/server/routers/ai");

const USER_ID = randomUUID();
const DESIGN_ID = randomUUID();
const MEDIA_ID = randomUUID();
const PACK_ID = randomUUID();
const CLEAN_URL =
  "https://res.cloudinary.com/demo/image/upload/v1/zaffa-renders/abc123.png";

function caller() {
  return aiRouter.createCaller({
    user: { id: USER_ID, email: "noor@example.com", is_anonymous: false },
    req: new Request("https://zaffa.ai"),
  } as never);
}

const INPUT = {
  eventType: "wedding" as const,
  setting: "outdoor" as const,
  size: "medium" as const,
  guestCount: 120,
  palette: { colors: ["#ffffff"] },
  references: [
    { url: "https://res.cloudinary.com/demo/ref.jpg", category: "flowers" as const },
  ],
  styleNotes: "white roses, warm lights",
};

beforeEach(() => {
  vi.clearAllMocks();
  ensureFreePack.mockResolvedValue({});
  requireActivePack.mockResolvedValue({
    id: PACK_ID,
    sku: "wedding_free_taste_v1",
  });
  consumeQuota.mockResolvedValue(undefined);
  renderScene.mockResolvedValue({
    imageUrl: CLEAN_URL,
    publicId: "zaffa-renders/abc123",
    text: null,
    model: "google/gemini-3-pro-image-preview",
    costUsd: 0.136232,
  });
  prismaMock.venueDesign.findFirst.mockResolvedValue({ id: DESIGN_ID } as never);
  prismaMock.venueDesignMedia.create.mockResolvedValue({ id: MEDIA_ID } as never);
  prismaMock.venueDesign.update.mockResolvedValue({ id: DESIGN_ID } as never);
});

describe("ai.renderScene with a designId (server-side persistence)", () => {
  it("refuses a design that is not the caller's before any pack or image work", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue(null);
    await expect(
      caller().renderScene({ ...INPUT, designId: DESIGN_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prismaMock.venueDesign.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DESIGN_ID, user_id: USER_ID },
      }),
    );
    expect(ensureFreePack).not.toHaveBeenCalled();
    expect(requireActivePack).not.toHaveBeenCalled();
    expect(renderScene).not.toHaveBeenCalled();
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(prismaMock.venueDesignMedia.create).not.toHaveBeenCalled();
  });

  it("writes the render row with the clean URL and its provenance", async () => {
    await caller().renderScene({ ...INPUT, designId: DESIGN_ID });
    expect(prismaMock.venueDesignMedia.create).toHaveBeenCalledWith({
      data: {
        design_id: DESIGN_ID,
        type: "render",
        url: CLEAN_URL,
        cloudinary_public_id: "zaffa-renders/abc123",
        meta: {
          mode: "generate",
          model: "google/gemini-3-pro-image-preview",
          costUsd: 0.136232,
        },
      },
      select: { id: true },
    });
    expect(prismaMock.venueDesign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DESIGN_ID },
        data: { updated_at: expect.any(Date) },
      }),
    );
  });

  it("writes the row only after the quota was consumed", async () => {
    const order: string[] = [];
    consumeQuota.mockImplementation(async () => {
      order.push("consume");
    });
    prismaMock.venueDesignMedia.create.mockImplementation((async () => {
      order.push("insert");
      return { id: MEDIA_ID };
    }) as never);
    await caller().renderScene({ ...INPUT, designId: DESIGN_ID });
    expect(order).toEqual(["consume", "insert"]);
  });

  it("returns the media id and never the clean asset once the row exists", async () => {
    const res = await caller().renderScene({ ...INPUT, designId: DESIGN_ID });
    expect(res.mediaId).toBe(MEDIA_ID);
    expect(res).not.toHaveProperty("cleanImageUrl");
    expect(res).not.toHaveProperty("publicId");
    // Free tier: the only URL on the wire is the watermarked one.
    expect(res.imageUrl).toBe("https://wm.example/zaffa-renders/abc123");
    expect(res.watermarked).toBe(true);
  });

  it("omits costUsd from meta when the provider did not report one", async () => {
    renderScene.mockResolvedValue({
      imageUrl: CLEAN_URL,
      publicId: "zaffa-renders/abc123",
      text: null,
      model: "google/gemini-3-pro-image-preview",
      costUsd: null,
    });
    await caller().renderScene({ ...INPUT, designId: DESIGN_ID });
    const data = prismaMock.venueDesignMedia.create.mock.calls[0][0].data;
    expect(data.meta).toEqual({
      mode: "generate",
      model: "google/gemini-3-pro-image-preview",
    });
  });

  it("still hands back the paid-for image when the insert fails, and reports it", async () => {
    prismaMock.venueDesignMedia.create.mockRejectedValue(new Error("fk violation"));
    const res = await caller().renderScene({ ...INPUT, designId: DESIGN_ID });
    expect(reportError).toHaveBeenCalledWith(
      "ai.render_scene.persist_failed",
      expect.any(Error),
      expect.objectContaining({ userId: USER_ID, designId: DESIGN_ID }),
    );
    expect(res.mediaId).toBeNull();
    expect(res.imageUrl).toBe("https://wm.example/zaffa-renders/abc123");
    // The old shape comes back so the client can still try saveMedia.
    expect(res.cleanImageUrl).toBe(CLEAN_URL);
    expect(consumeQuota).toHaveBeenCalledWith(PACK_ID, "render");
  });

  it("keeps the media id when only the design bump fails", async () => {
    prismaMock.venueDesign.update.mockRejectedValue(new Error("timeout"));
    const res = await caller().renderScene({ ...INPUT, designId: DESIGN_ID });
    expect(res.mediaId).toBe(MEDIA_ID);
    expect(res).not.toHaveProperty("cleanImageUrl");
    expect(reportError).toHaveBeenCalledWith(
      "ai.render_scene.persist_failed",
      expect.any(Error),
      expect.objectContaining({ mediaId: MEDIA_ID }),
    );
  });

  it("serves a paid pack the clean asset as imageUrl, the tier it paid for", async () => {
    requireActivePack.mockResolvedValue({
      id: PACK_ID,
      sku: "wedding_design_pack_v1",
    });
    const res = await caller().renderScene({ ...INPUT, designId: DESIGN_ID });
    expect(res.imageUrl).toBe(CLEAN_URL);
    expect(res.watermarked).toBe(false);
  });

  it("tags the funnel event with the mode", async () => {
    await caller().renderScene({ ...INPUT, designId: DESIGN_ID });
    expect(trackServer).toHaveBeenCalledWith(
      USER_ID,
      "design.render_generated",
      expect.objectContaining({
        mode: "generate",
        design_id: DESIGN_ID,
        persisted: true,
      }),
    );
  });
});

describe("ai.renderScene without a designId (clients built before F0)", () => {
  it("writes no row and returns the old shape with the clean URL", async () => {
    const res = await caller().renderScene(INPUT);
    expect(prismaMock.venueDesign.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.venueDesignMedia.create).not.toHaveBeenCalled();
    expect(res.mediaId).toBeNull();
    expect(res.cleanImageUrl).toBe(CLEAN_URL);
    expect(res.publicId).toBe("zaffa-renders/abc123");
  });
});
