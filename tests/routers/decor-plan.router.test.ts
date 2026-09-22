import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";

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

const enforceTrpc = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/rate-limit", () => ({
  enforceTrpc: (...args: unknown[]) => enforceTrpc(...args),
}));

const chatCompletionJson = vi.fn();
vi.mock("@/server/llm/openrouter", () => ({
  chatCompletionJson: (...args: unknown[]) => chatCompletionJson(...args),
  designLlmModel: () => "google/gemini-3.5-flash-lite",
}));

const printSizedUrl = vi.fn(
  (id: string, width: number) => `https://res.cloudinary.com/demo/w_${width}/${id}.jpg`,
);
vi.mock("@/lib/cloudinary", () => ({
  printSizedUrl: (id: string, width: number) => printSizedUrl(id, width),
}));

const resolveCountryFromRequest = vi.fn((..._args: unknown[]): string | null => "EG");
vi.mock("@/server/services/vision-pack-pricing", () => ({
  resolveCountryFromRequest: (...args: unknown[]) => resolveCountryFromRequest(...args),
}));

const { decorPlanRouter } = await import("@/server/routers/decor-plan");

const OWNER_ID = randomUUID();
const ADMIN_ID = randomUUID();
const STRANGER_ID = randomUUID();
const MEDIA_ID = randomUUID();
const DESIGN_ID = randomUUID();

const ANALYSIS = {
  table_shape: "long",
  centerpiece: "tall",
  has_stage: true,
  has_arch: false,
  has_entrance_decor: false,
  has_dance_floor: true,
  has_draping: false,
  has_chandeliers: true,
  has_string_lights: true,
  candle_density: "lots",
  floral_density: "lush",
  flowers: ["rose", "baby_breath"],
  linens: "runner_only",
  chair_style: "cross_back",
  questions: [
    "Are the roses real or silk?",
    "Does the venue include the stage?",
    "How long does setup take?",
  ],
};

function caller(
  user: { id: string; is_anonymous?: boolean },
  cookie = "zaffa_locale=en",
) {
  return decorPlanRouter.createCaller({
    user: { email: null, is_anonymous: false, ...user },
    req: new Request("https://zaffa.ai/api/trpc", { headers: { cookie } }),
  } as never);
}

function mediaRow(meta: unknown = null, designOverrides: Record<string, unknown> = {}) {
  return {
    id: MEDIA_ID,
    url: "https://res.cloudinary.com/demo/image/upload/v1/zaffa-renders/r1.png",
    cloudinary_public_id: "zaffa-renders/r1",
    meta,
    design: {
      id: DESIGN_ID,
      user_id: OWNER_ID,
      guest_count: 150,
      size: "large",
      setting: "indoor",
      ...designOverrides,
    },
  };
}

/** The meta the first `venueDesignMedia.update` call wrote. */
function writtenMeta(): Record<string, unknown> & { decor: Record<string, unknown> } {
  const call = prismaMock.venueDesignMedia.update.mock.calls[0][0] as unknown as {
    data: { meta: Record<string, unknown> & { decor: Record<string, unknown> } };
  };
  return call.data.meta;
}

const CACHED_META = {
  mode: "generate",
  model: "openai/gpt-image",
  costUsd: 0.057,
  decor: { ...ANALYSIS, locale: "en", analyzedAt: "2026-09-22T10:00:00.000Z" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resolveCountryFromRequest.mockReturnValue("EG");
  chatCompletionJson.mockResolvedValue(ANALYSIS);
  prismaMock.venueDesignMedia.findFirst.mockResolvedValue(mediaRow() as never);
  prismaMock.venueDesignMedia.update.mockResolvedValue({} as never);
  prismaMock.profile.findUnique.mockResolvedValue({
    role: "client",
    free_render_email: null,
  } as never);
});

describe("decorPlan.forMedia: access", () => {
  it("is refused while the kill switch is off, before any read", async () => {
    vi.stubEnv("FLAG_DECOR_PLAN", "0");
    await expect(
      caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "DECOR_PLAN_DISABLED" });
    expect(prismaMock.venueDesignMedia.findFirst).not.toHaveBeenCalled();
    expect(chatCompletionJson).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND for a missing render, and only looks at renders", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(null);
    await expect(
      caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prismaMock.venueDesignMedia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MEDIA_ID, type: "render" } }),
    );
  });

  it("answers NOT_FOUND, not FORBIDDEN, to someone else's render", async () => {
    await expect(
      caller({ id: STRANGER_ID }).forMedia({ mediaId: MEDIA_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(chatCompletionJson).not.toHaveBeenCalled();
    expect(prismaMock.venueDesignMedia.update).not.toHaveBeenCalled();
  });

  it("lets an admin read any couple's plan for the enquiry brief", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ role: "admin" } as never);
    const res = await caller({ id: ADMIN_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(res.plan.items.length).toBeGreaterThan(0);
    expect(trackServer).toHaveBeenCalledWith(
      ADMIN_ID,
      "design.decor_plan_viewed",
      expect.objectContaining({ viewer: "admin" }),
    );
  });

  it("refuses an anonymous owner who has not passed the email gate", async () => {
    await expect(
      caller({ id: OWNER_ID, is_anonymous: true }).forMedia({ mediaId: MEDIA_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "EMAIL_REQUIRED" });
    expect(chatCompletionJson).not.toHaveBeenCalled();
    expect(enforceTrpc).not.toHaveBeenCalled();
  });

  it("serves an anonymous owner who gave their email at the gate", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      free_render_email: "noor@example.com",
    } as never);
    const res = await caller({ id: OWNER_ID, is_anonymous: true }).forMedia({
      mediaId: MEDIA_ID,
    });
    expect(res.plan.currency).toBe("EGP");
  });
});

describe("decorPlan.forMedia: the first read", () => {
  it("reads the clean 1024px render once, with the strict decor schema", async () => {
    await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });

    expect(enforceTrpc).toHaveBeenCalledWith("aiDecorPlan", OWNER_ID);
    expect(printSizedUrl).toHaveBeenCalledWith("zaffa-renders/r1", 1024);
    expect(chatCompletionJson).toHaveBeenCalledTimes(1);
    const args = chatCompletionJson.mock.calls[0][0] as {
      temperature: number;
      jsonSchema: { name: string; schema: { required: string[] } };
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(args.temperature).toBe(0.2);
    expect(args.jsonSchema.name).toBe("decor_analysis");
    expect(args.jsonSchema.schema.required).toContain("centerpiece");
    const user = args.messages.find((m) => m.role === "user")!;
    expect(user.content).toEqual(
      expect.arrayContaining([
        { type: "image_url", image_url: { url: "https://res.cloudinary.com/demo/w_1024/zaffa-renders/r1.jpg" } },
      ]),
    );
    // Never the watermarked tier URL, never a price question to the model.
    const system = args.messages.find((m) => m.role === "system")!.content as string;
    expect(system).toMatch(/never estimate quantities, sizes, areas or prices/i);
  });

  it("caches the analysis on the media row, keeping every other meta key", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      mediaRow({ mode: "refine", model: "m", instructionRaw: "more roses" }) as never,
    );
    await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(prismaMock.venueDesignMedia.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MEDIA_ID } }),
    );
    expect(writtenMeta()).toMatchObject({
      mode: "refine",
      model: "m",
      instructionRaw: "more roses",
      decor: expect.objectContaining({ table_shape: "long", locale: "en" }),
    });
  });

  it("tracks the first compute only", async () => {
    await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(trackServer).toHaveBeenCalledWith(
      OWNER_ID,
      "design.decor_plan_viewed",
      expect.objectContaining({ design_id: DESIGN_ID, media_id: MEDIA_ID, market: "EG", viewer: "owner" }),
    );

    trackServer.mockClear();
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(mediaRow(CACHED_META) as never);
    await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("stops at the limiter before paying for a read", async () => {
    enforceTrpc.mockRejectedValueOnce(new TRPCError({ code: "TOO_MANY_REQUESTS" }));
    await expect(
      caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(chatCompletionJson).not.toHaveBeenCalled();
  });

  it("reports and fails cleanly when the model call fails", async () => {
    chatCompletionJson.mockRejectedValueOnce(new Error("LLM 402: credits"));
    await expect(
      caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "DECOR_PLAN_FAILED" });
    expect(reportError).toHaveBeenCalledWith(
      "decor_plan.analyze_failed",
      expect.any(Error),
      expect.objectContaining({ mediaId: MEDIA_ID }),
    );
    expect(prismaMock.venueDesignMedia.update).not.toHaveBeenCalled();
  });

  it("refuses an answer outside the fixed vocabulary rather than pricing it", async () => {
    chatCompletionJson.mockResolvedValueOnce({ ...ANALYSIS, centerpiece: "gigantic" });
    await expect(
      caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(prismaMock.venueDesignMedia.update).not.toHaveBeenCalled();
  });

  it("ignores any price or quantity the model volunteers", async () => {
    chatCompletionJson.mockResolvedValueOnce({ ...ANALYSIS, total_price: 1, tables: 999 });
    const res = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(res.plan.tables).toBe(15);
    const stored = writtenMeta().decor;
    expect(stored).not.toHaveProperty("total_price");
    expect(stored).not.toHaveProperty("tables");
  });

  it("keeps at most five questions and strips long dashes from them", async () => {
    chatCompletionJson.mockResolvedValueOnce({
      ...ANALYSIS,
      questions: [
        "Real roses — or silk?",
        "Setup time–teardown time?",
        "Q3?",
        "Q3?",
        "Q4?",
        "Q5?",
        "Q6?",
        "  ",
      ],
    });
    const res = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(res.questions).toEqual([
      "Real roses, or silk?",
      "Setup time, teardown time?",
      "Q3?",
      "Q4?",
      "Q5?",
    ]);
  });

  it("still returns the plan when the cache write fails, and says so", async () => {
    prismaMock.venueDesignMedia.update.mockRejectedValueOnce(new Error("db down"));
    const res = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(res.plan.items.length).toBeGreaterThan(0);
    expect(reportError).toHaveBeenCalledWith(
      "decor_plan.cache_write_failed",
      expect.any(Error),
      expect.objectContaining({ mediaId: MEDIA_ID }),
    );
  });

  it("analyses a legacy render with no Cloudinary id from its stored URL", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue({
      ...mediaRow(),
      cloudinary_public_id: null,
      url: "https://cdn.example.com/legacy.png",
    } as never);
    await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    const args = chatCompletionJson.mock.calls[0][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(JSON.stringify(args.messages)).toContain("https://cdn.example.com/legacy.png");
    // A legacy row gets `{decor}`, never a guessed mode.
    expect(writtenMeta()).not.toHaveProperty("mode");
  });
});

describe("decorPlan.forMedia: cached reads", () => {
  beforeEach(() => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(mediaRow(CACHED_META) as never);
  });

  it("never calls the model or the limiter again", async () => {
    await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID, market: "AE" });
    expect(chatCompletionJson).not.toHaveBeenCalled();
    expect(enforceTrpc).not.toHaveBeenCalled();
    expect(prismaMock.venueDesignMedia.update).not.toHaveBeenCalled();
  });

  it("prices in the market of the visitor's country by default", async () => {
    resolveCountryFromRequest.mockReturnValue("SA");
    const res = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(res.plan.market).toBe("SA");
    expect(res.plan.currency).toBe("SAR");
  });

  it("falls back to USD when the country is unknown", async () => {
    resolveCountryFromRequest.mockReturnValue(null);
    const res = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(res.plan.currency).toBe("USD");
  });

  it("switches market on request", async () => {
    const res = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID, market: "EU" });
    expect(res.plan.currency).toBe("EUR");
    expect(res.markets.map((m) => m.currency)).toEqual(["EGP", "AED", "SAR", "EUR", "USD"]);
  });

  it("re-prices a guest-count change from the same analysis", async () => {
    const at150 = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      mediaRow(CACHED_META, { guest_count: 300 }) as never,
    );
    const at300 = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(at150.plan.tables).toBe(15);
    expect(at300.plan.tables).toBe(30);
    expect(at300.plan.totals.hi).toBeGreaterThan(at150.plan.totals.hi);
    expect(chatCompletionJson).not.toHaveBeenCalled();
  });

  it("falls back to the size bucket when the couple never gave a count", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      mediaRow(CACHED_META, { guest_count: null, size: "intimate" }) as never,
    );
    const res = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(res.plan.guestCount).toBe(30);
    expect(res.plan.guestCountAssumed).toBe(true);
  });

  it("returns questions only in the language they were written in", async () => {
    const en = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID, locale: "en" });
    expect(en.questions).toHaveLength(3);
    const ar = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID, locale: "ar" });
    expect(ar.questions).toEqual([]);
    // Without an explicit locale, the cookie decides.
    const fromCookie = await caller({ id: OWNER_ID }, "zaffa_locale=ar").forMedia({
      mediaId: MEDIA_ID,
    });
    expect(fromCookie.questions).toEqual([]);
  });

  it("hands the client what the render shows, never the model or cost", async () => {
    const res = await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(res.seen).toEqual({
      flowers: ["rose", "baby_breath"],
      tableShape: "long",
      chairStyle: "cross_back",
      floralDensity: "lush",
    });
    const json = JSON.stringify(res);
    expect(json).not.toContain("gemini");
    expect(json).not.toContain("0.057");
    expect(json).not.toContain("zaffa-renders/r1");
  });

  it("re-reads an analysis this code cannot trust", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      mediaRow({ ...CACHED_META, decor: { ...CACHED_META.decor, linens: "velvet" } }) as never,
    );
    await caller({ id: OWNER_ID }).forMedia({ mediaId: MEDIA_ID });
    expect(chatCompletionJson).toHaveBeenCalledTimes(1);
  });
});
