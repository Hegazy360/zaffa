import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * The lookbook's decor plan pages (F4). The lookbook is a paid download, so
 * every failure here must degrade to "no plan pages", never to a failed PDF,
 * and the uncached path must spend at most one model call, under the same
 * limiter as the designer panel.
 */

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("server-only", () => ({}));
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

const consume = vi.fn<(...args: unknown[]) => Promise<{ success: boolean }>>();
vi.mock("@/lib/rate-limit", () => ({
  consume: (...args: unknown[]) => consume(...args),
}));

const chatCompletionJson = vi.fn();
vi.mock("@/server/llm/openrouter", () => ({
  chatCompletionJson: (...args: unknown[]) => chatCompletionJson(...args),
  designLlmModel: () => "google/gemini-3.5-flash-lite",
}));

vi.mock("@/lib/cloudinary", () => ({
  printSizedUrl: (id: string, width: number) =>
    `https://res.cloudinary.com/demo/w_${width}/${id}.jpg`,
}));

const { lookbookDecorPlan } = await import("@/server/services/lookbook-decor-plan");

const USER_ID = randomUUID();
const DESIGN_ID = randomUUID();
const MEDIA_ID = randomUUID();

const ANALYSIS = {
  table_shape: "round",
  centerpiece: "low",
  has_stage: true,
  has_arch: false,
  has_entrance_decor: false,
  has_dance_floor: false,
  has_draping: false,
  has_chandeliers: false,
  has_string_lights: false,
  candle_density: "some",
  floral_density: "medium",
  flowers: ["rose"],
  linens: "floor_length",
  chair_style: "chiavari",
  questions: ["Are the roses real?", "Is the kosha included?", "How long is setup?"],
};

const CACHED = {
  mode: "generate",
  decor: { ...ANALYSIS, locale: "en", analyzedAt: "2026-09-22T10:00:00.000Z" },
};

function args(meta: unknown, overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    designId: DESIGN_ID,
    render: {
      id: MEDIA_ID,
      url: "https://res.cloudinary.com/demo/image/upload/v1/zaffa-renders/r1.png",
      cloudinary_public_id: "zaffa-renders/r1",
      meta,
    },
    design: { guest_count: 120, size: "medium", setting: "indoor" },
    locale: "en",
    market: "EG" as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  consume.mockResolvedValue({ success: true });
  chatCompletionJson.mockResolvedValue(ANALYSIS);
  prismaMock.venueDesignMedia.update.mockResolvedValue({} as never);
});

describe("lookbookDecorPlan", () => {
  it("prices a cached analysis for free: no limiter, no model, no event", async () => {
    const result = await lookbookDecorPlan(args(CACHED));
    expect(result?.plan.market).toBe("EG");
    expect(result?.plan.guestCount).toBe(120);
    // 120 guests at 10 a table, plus the head table.
    expect(result?.plan.items.find((i) => i.key === "tablecloth")?.qty).toBe(13);
    expect(result?.questions).toEqual(ANALYSIS.questions);
    expect(consume).not.toHaveBeenCalled();
    expect(chatCompletionJson).not.toHaveBeenCalled();
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("prints the standard questions when the model's are in another language", async () => {
    const result = await lookbookDecorPlan(args(CACHED, { locale: "ar" }));
    expect(result?.questions).toEqual([]);
  });

  it("reads an unanalysed render once, caches it, and tracks it", async () => {
    const result = await lookbookDecorPlan(args({ mode: "generate", costUsd: 0.05 }));
    expect(consume).toHaveBeenCalledWith("aiDecorPlan", USER_ID);
    expect(chatCompletionJson).toHaveBeenCalledTimes(1);
    const call = prismaMock.venueDesignMedia.update.mock.calls[0][0] as unknown as {
      where: { id: string };
      data: { meta: Record<string, unknown> };
    };
    expect(call.where.id).toBe(MEDIA_ID);
    // Every other meta key survives the cache write.
    expect(call.data.meta).toMatchObject({ mode: "generate", costUsd: 0.05 });
    expect(call.data.meta.decor).toMatchObject({ has_stage: true, locale: "en" });
    expect(trackServer).toHaveBeenCalledWith(
      USER_ID,
      "design.decor_plan_viewed",
      expect.objectContaining({ media_id: MEDIA_ID, viewer: "lookbook", market: "EG" }),
    );
    expect(result?.plan.items.length).toBeGreaterThan(0);
  });

  it("skips the plan when the limiter is spent, without a model call", async () => {
    consume.mockResolvedValue({ success: false });
    expect(await lookbookDecorPlan(args(null))).toBeNull();
    expect(chatCompletionJson).not.toHaveBeenCalled();
  });

  it("skips the plan and reports when the model fails", async () => {
    chatCompletionJson.mockRejectedValue(new Error("openrouter 402"));
    expect(await lookbookDecorPlan(args(null))).toBeNull();
    expect(reportError).toHaveBeenCalledWith(
      "decor_plan.analyze_failed",
      expect.any(Error),
      expect.objectContaining({ mediaId: MEDIA_ID, from: "lookbook" }),
    );
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("still prints the plan when only the cache write fails", async () => {
    prismaMock.venueDesignMedia.update.mockRejectedValue(new Error("db down"));
    const result = await lookbookDecorPlan(args(null));
    expect(result?.plan.items.length).toBeGreaterThan(0);
    expect(reportError).toHaveBeenCalledWith(
      "decor_plan.cache_write_failed",
      expect.any(Error),
      expect.objectContaining({ mediaId: MEDIA_ID }),
    );
  });

  it("is off with the kill switch, before any read", async () => {
    vi.stubEnv("FLAG_DECOR_PLAN", "0");
    expect(await lookbookDecorPlan(args(null))).toBeNull();
    expect(await lookbookDecorPlan(args(CACHED))).toBeNull();
    expect(consume).not.toHaveBeenCalled();
    expect(chatCompletionJson).not.toHaveBeenCalled();
  });
});
