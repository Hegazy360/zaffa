import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// F1 mode selection in ai.renderScene. A design with the couple's own venue
// photo, owned by the caller and in their folder, is dressed on the venue
// model with the photo built on the server from its public id. Anything
// else (flag off, no photo, a photo outside their folder, no design id)
// renders the old way. The scene functions, quota helpers and Cloudinary
// are mocked; no model is ever called.

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

const enforceTrpc = vi.fn();
const enforceTrpcMany = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  enforceTrpc: (...args: unknown[]) => enforceTrpc(...args),
  enforceTrpcMany: (...args: unknown[]) => enforceTrpcMany(...args),
  ipFromRequest: vi.fn(() => "1.2.3.4"),
}));

const verifyTurnstile = vi.fn();
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: (...args: unknown[]) => verifyTurnstile(...args),
}));

vi.mock("@/lib/cloudinary", () => ({
  watermarkedUrl: vi.fn((id: string) => `https://wm.example/${id}`),
  venueModelInputUrl: vi.fn(
    (id: string) => `https://res.cloudinary.com/zaffa/image/upload/s--sig--/c_limit,h_1536,w_1536/${id}.jpg`,
  ),
}));

const renderScene = vi.fn();
const dressVenueScene = vi.fn();
vi.mock("@/server/ai/scene-generator", () => ({
  renderScene: (...args: unknown[]) => renderScene(...args),
  dressVenueScene: (...args: unknown[]) => dressVenueScene(...args),
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
const OTHER_USER_ID = randomUUID();
const DESIGN_ID = randomUUID();
const MEDIA_ID = randomUUID();
const PACK_ID = randomUUID();
const VENUE_PUBLIC_ID = `zaffa-venues/${USER_ID}/hall`;
const VENUE_MODEL_URL = `https://res.cloudinary.com/zaffa/image/upload/s--sig--/c_limit,h_1536,w_1536/${VENUE_PUBLIC_ID}.jpg`;
const CLEAN_URL =
  "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-renders/dressed.png";

function venuePhoto(publicId = VENUE_PUBLIC_ID) {
  return {
    url: `https://res.cloudinary.com/zaffa/image/upload/v1/${publicId}.jpg`,
    publicId,
    width: 1600,
    height: 900,
  };
}

function caller(isAnonymous = false) {
  return aiRouter.createCaller({
    user: { id: USER_ID, email: null, is_anonymous: isAnonymous },
    req: new Request("https://zaffa.ai"),
  } as never);
}

const INPUT = {
  eventType: "wedding" as const,
  setting: "indoor" as const,
  size: "large" as const,
  guestCount: 250,
  palette: { colors: ["#ffffff"] },
  // The venue alone is enough: no mood references at all.
  references: [],
  designId: DESIGN_ID,
};

const RESULT = {
  imageUrl: CLEAN_URL,
  publicId: "zaffa-renders/dressed",
  text: null,
  model: "openai/gpt-image-2.5-sunburst",
  costUsd: 0.0571,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLAG_VENUE_PHOTO;
  verifyTurnstile.mockResolvedValue({ ok: true });
  ensureFreePack.mockResolvedValue({});
  requireActivePack.mockResolvedValue({ id: PACK_ID, sku: "wedding_free_taste_v1" });
  consumeQuota.mockResolvedValue(undefined);
  renderScene.mockResolvedValue({ ...RESULT, model: "google/gemini-3-pro-image-preview" });
  dressVenueScene.mockResolvedValue(RESULT);
  prismaMock.venueDesign.findFirst.mockResolvedValue({
    id: DESIGN_ID,
    venue_photo: venuePhoto(),
  } as never);
  prismaMock.venueDesignMedia.create.mockResolvedValue({ id: MEDIA_ID } as never);
  prismaMock.venueDesign.update.mockResolvedValue({ id: DESIGN_ID } as never);
});

afterEach(() => {
  delete process.env.FLAG_VENUE_PHOTO;
});

describe("ai.renderScene dresses the couple's venue photo", () => {
  it("renders on the venue path with the photo built from its public id, not the old path", async () => {
    await caller().renderScene(INPUT);
    expect(renderScene).not.toHaveBeenCalled();
    expect(dressVenueScene).toHaveBeenCalledTimes(1);
    const [sceneInput, venue] = dressVenueScene.mock.calls[0];
    expect(venue).toEqual({ url: VENUE_MODEL_URL, publicId: VENUE_PUBLIC_ID });
    expect(sceneInput).toMatchObject({ guestCount: 250, references: [] });
    // The ownership read also fetched the photo; nothing else chose it.
    expect(prismaMock.venueDesign.findFirst).toHaveBeenCalledWith({
      where: { id: DESIGN_ID, user_id: USER_ID },
      select: { id: true, venue_photo: true },
    });
  });

  it("goes through the same bot check, quota and limits as any render", async () => {
    await caller(true).renderScene({ ...INPUT, turnstileToken: "tok" });
    expect(verifyTurnstile).toHaveBeenCalledWith("tok", "1.2.3.4");
    expect(requireActivePack).toHaveBeenCalledWith(USER_ID, "render");
    expect(enforceTrpcMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({ key: "aiRender" }),
        expect.objectContaining({ key: "aiRenderDaily" }),
      ],
      USER_ID,
    );
    expect(enforceTrpc).toHaveBeenCalledWith(
      "aiRenderFreePerIp",
      "1.2.3.4",
      "FREE_RENDER_RATE_LIMITED",
    );
    expect(consumeQuota).toHaveBeenCalledWith(PACK_ID, "render");
  });

  it("records the mode, model, cost and the venue photo it dressed", async () => {
    const res = await caller().renderScene(INPUT);
    expect(prismaMock.venueDesignMedia.create).toHaveBeenCalledWith({
      data: {
        design_id: DESIGN_ID,
        type: "render",
        url: CLEAN_URL,
        cloudinary_public_id: "zaffa-renders/dressed",
        meta: {
          mode: "dress_venue",
          model: "openai/gpt-image-2.5-sunburst",
          costUsd: 0.0571,
          venuePublicId: VENUE_PUBLIC_ID,
        },
      },
      select: { id: true },
    });
    expect(res.mode).toBe("dress_venue");
    expect(res.mediaId).toBe(MEDIA_ID);
    // Free tier still only ever sees the watermarked URL.
    expect(res.imageUrl).toBe("https://wm.example/zaffa-renders/dressed");
    expect(trackServer).toHaveBeenCalledWith(
      USER_ID,
      "design.render_generated",
      expect.objectContaining({ mode: "dress_venue", persisted: true }),
    );
  });

  it("reports a failed dress, spends no quota and writes no row", async () => {
    dressVenueScene.mockRejectedValue(new Error("Image generation failed: 402"));
    await expect(caller().renderScene(INPUT)).rejects.toThrow(/402/);
    expect(reportError).toHaveBeenCalledWith(
      "ai.render_scene.dress_venue_failed",
      expect.any(Error),
      expect.objectContaining({ userId: USER_ID, designId: DESIGN_ID, publicId: VENUE_PUBLIC_ID }),
    );
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(prismaMock.venueDesignMedia.create).not.toHaveBeenCalled();
  });
});

describe("ai.renderScene keeps the prompt-only path", () => {
  it("when the venuePhoto kill switch is off", async () => {
    process.env.FLAG_VENUE_PHOTO = "0";
    const res = await caller().renderScene({
      ...INPUT,
      references: [{ url: "https://res.cloudinary.com/zaffa/ref.jpg", category: "flowers" }],
    });
    expect(dressVenueScene).not.toHaveBeenCalled();
    expect(renderScene).toHaveBeenCalledTimes(1);
    expect(res.mode).toBe("generate");
    const meta = prismaMock.venueDesignMedia.create.mock.calls[0][0].data.meta;
    expect(meta).toMatchObject({ mode: "generate" });
    expect(meta).not.toHaveProperty("venuePublicId");
  });

  it("when the design has no venue photo, or an unreadable one", async () => {
    for (const venue_photo of [null, { url: "not a url", publicId: "" }]) {
      vi.clearAllMocks();
      prismaMock.venueDesign.findFirst.mockResolvedValue({
        id: DESIGN_ID,
        venue_photo,
      } as never);
      prismaMock.venueDesignMedia.create.mockResolvedValue({ id: MEDIA_ID } as never);
      await caller().renderScene(INPUT);
      expect(dressVenueScene).not.toHaveBeenCalled();
      expect(renderScene).toHaveBeenCalledTimes(1);
    }
  });

  it("when the stored photo is outside the caller's folder, and says so", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue({
      id: DESIGN_ID,
      venue_photo: venuePhoto(`zaffa-venues/${OTHER_USER_ID}/their-hall`),
    } as never);
    const res = await caller().renderScene(INPUT);
    expect(dressVenueScene).not.toHaveBeenCalled();
    expect(renderScene).toHaveBeenCalledTimes(1);
    expect(res.mode).toBe("generate");
    expect(reportError).toHaveBeenCalledWith(
      "ai.render_scene.venue_photo_foreign",
      expect.any(Error),
      expect.objectContaining({ userId: USER_ID, designId: DESIGN_ID }),
    );
  });

  it("when no design id is sent: there is no stored photo to trust", async () => {
    const { designId: _omit, ...withoutDesign } = INPUT;
    void _omit;
    await caller().renderScene(withoutDesign);
    expect(prismaMock.venueDesign.findFirst).not.toHaveBeenCalled();
    expect(dressVenueScene).not.toHaveBeenCalled();
    expect(renderScene).toHaveBeenCalledTimes(1);
  });

  it("refuses a design that is not the caller's before reading any photo", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue(null);
    await expect(caller().renderScene(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(dressVenueScene).not.toHaveBeenCalled();
    expect(renderScene).not.toHaveBeenCalled();
    expect(ensureFreePack).not.toHaveBeenCalled();
  });
});
