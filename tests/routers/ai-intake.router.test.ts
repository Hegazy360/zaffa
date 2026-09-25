import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// F3, ai.checkIntake: the cheap read of a couple's brief before their
// render, and the brief it writes riding into ai.renderScene. What must hold:
//  - the kill switch stops it before anything is spent;
//  - it is limited per IP, per user and globally, hourly and daily, all
//    failing closed (anonymous sessions reach it, a bot minting fresh
//    users still shares its IP's bucket, and it bills the balance the
//    renders run on);
//  - it answers in the couple's language (the input, else the cookie);
//  - a failure is reported and comes back as one stable code, never the
//    provider's words, so the card can quietly step aside;
//  - a success is counted with its number of conflicts;
//  - renderScene hands the brief to whichever prompt it builds.
// The intake module, scene functions, quota helpers and limiters are
// mocked; no model is ever called.

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("server-only", () => ({}));

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

vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn(async () => ({ ok: true })) }));

vi.mock("@/lib/cloudinary", () => ({
  watermarkedUrl: vi.fn((id: string) => `https://wm.example/${id}`),
  venueModelInputUrl: vi.fn((id: string) => `https://model.example/venue/${id}.jpg`),
  renderModelInputUrl: vi.fn((id: string) => `https://model.example/render/${id}.jpg`),
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

const checkIntake = vi.fn();
vi.mock("@/server/ai/intake", () => ({
  checkIntake: (...args: unknown[]) => checkIntake(...args),
}));

vi.mock("@/server/routers/vision-packs", () => ({
  ensureFreePack: vi.fn(async () => ({})),
  requireActivePack: vi.fn(async () => ({ id: "pack-1", sku: "wedding_design_pack_v1" })),
  consumeQuota: vi.fn(),
  reserveEdit: vi.fn(),
  releaseEdit: vi.fn(),
}));

const { aiRouter } = await import("@/server/routers/ai");

const USER_ID = randomUUID();
const DESIGN_ID = randomUUID();

function caller({
  anonymous = false,
  cookie,
}: { anonymous?: boolean; cookie?: string } = {}) {
  return aiRouter.createCaller({
    user: { id: USER_ID, email: null, is_anonymous: anonymous },
    req: new Request("https://zaffa.ai/api/trpc", {
      headers: cookie ? { cookie } : {},
    }),
  } as never);
}

const INPUT = {
  eventType: "wedding" as const,
  setting: "indoor" as const,
  guestCount: 180,
  palette: { name: "Ivory and gold", colors: ["#fdf8f0", "#d4af37"] },
  styleNotes: "جنينة سرية ونجف متعلق في الشجر",
  references: [
    {
      url: "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-references/u/lawn.jpg",
      category: "venue_decor" as const,
    },
  ],
  hasVenuePhoto: false,
};

const RESULT = {
  summary: "هنعملكم فرح في جنينة لـ 180 مدعو بألوان العاجي والدهبي.",
  briefEn: "Secret garden: crystal chandeliers hung from the trees.",
  conflicts: [{ kind: "setting", message: null, suggestedSetting: "outdoor" }],
  venueCandidateIndexes: [0],
  notesSetting: "outdoor",
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLAG_INTAKE_CHECK;
  delete process.env.FLAG_VENUE_PHOTO;
  enforceTrpc.mockResolvedValue(undefined);
  enforceTrpcMany.mockResolvedValue(undefined);
  checkIntake.mockResolvedValue(RESULT);
  renderScene.mockResolvedValue({
    imageUrl: "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-renders/r.png",
    publicId: "zaffa-renders/r",
    text: null,
    model: "google/gemini-3-pro-image-preview",
    costUsd: 0.13,
  });
});

afterEach(() => {
  delete process.env.FLAG_INTAKE_CHECK;
  delete process.env.FLAG_VENUE_PHOTO;
});

describe("ai.checkIntake", () => {
  it("reads the brief for an anonymous couple and returns the answer as is", async () => {
    const out = await caller({ anonymous: true }).checkIntake({ ...INPUT, locale: "ar" });
    expect(out).toEqual(RESULT);
    expect(checkIntake).toHaveBeenCalledWith({
      eventType: "wedding",
      setting: "indoor",
      guestCount: 180,
      palette: INPUT.palette,
      styleNotes: INPUT.styleNotes,
      references: INPUT.references,
      hasVenuePhoto: false,
      venuePhotoEnabled: true,
      locale: "ar",
    });
  });

  it("is limited per IP, per user and globally, by the hour and the day, before the model is asked", async () => {
    await caller({ anonymous: true }).checkIntake(INPUT);
    // The IP first (a bot mints users, not addresses) and the global
    // ceiling last; every one refuses rather than allows if Upstash is down.
    expect(enforceTrpc.mock.calls.map(([key, id]) => [key, id])).toEqual([
      ["aiIntake", "ip:1.2.3.4"],
      ["aiIntakeDaily", "ip:1.2.3.4"],
      ["aiIntake", USER_ID],
      ["aiIntakeDaily", USER_ID],
      ["aiIntakeGlobalDaily", "global"],
    ]);
    for (const call of enforceTrpc.mock.calls) {
      expect(call[3]).toEqual({ failClosed: true });
    }
    expect(enforceTrpc.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      checkIntake.mock.invocationCallOrder[0],
    );
  });

  it("stops at an IP's limit without spending the user's or everyone's budget", async () => {
    const { TRPCError } = await import("@trpc/server");
    enforceTrpc.mockImplementation(async (key: string, id: string) => {
      if (key === "aiIntakeDaily" && id.startsWith("ip:")) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "slow down" });
      }
    });
    await expect(caller().checkIntake(INPUT)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    const spent = enforceTrpc.mock.calls.map(([, id]) => id);
    expect(spent).not.toContain(USER_ID);
    expect(spent).not.toContain("global");
    expect(checkIntake).not.toHaveBeenCalled();
  });

  it("stops at a user's daily limit before the global ceiling is touched", async () => {
    const { TRPCError } = await import("@trpc/server");
    enforceTrpc.mockImplementation(async (key: string, id: string) => {
      if (key === "aiIntakeDaily" && id === USER_ID) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "slow down" });
      }
    });
    await expect(caller().checkIntake(INPUT)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(enforceTrpc.mock.calls.map(([, id]) => id)).not.toContain("global");
    expect(checkIntake).not.toHaveBeenCalled();
  });

  it("stops at the global ceiling without asking the model", async () => {
    const { TRPCError } = await import("@trpc/server");
    enforceTrpc.mockImplementation(async (key: string) => {
      if (key === "aiIntakeGlobalDaily") {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "slow down" });
      }
    });
    await expect(caller().checkIntake(INPUT)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(checkIntake).not.toHaveBeenCalled();
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("is off with its kill switch, before any limit or model", async () => {
    process.env.FLAG_INTAKE_CHECK = "0";
    await expect(caller().checkIntake(INPUT)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "INTAKE_DISABLED",
    });
    expect(enforceTrpc).not.toHaveBeenCalled();
    expect(checkIntake).not.toHaveBeenCalled();
  });

  it("offers no venue candidates while the venue photo feature is off", async () => {
    process.env.FLAG_VENUE_PHOTO = "0";
    await caller().checkIntake(INPUT);
    expect(checkIntake).toHaveBeenCalledWith(
      expect.objectContaining({ venuePhotoEnabled: false }),
    );
  });

  it("answers in the cookie's language when the client does not say", async () => {
    await caller({ cookie: "a=1; zaffa_locale=fr" }).checkIntake(INPUT);
    expect(checkIntake).toHaveBeenCalledWith(expect.objectContaining({ locale: "fr" }));
    await caller().checkIntake(INPUT);
    expect(checkIntake).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "en" }));
  });

  it("counts a check with its conflicts", async () => {
    await caller().checkIntake(INPUT);
    expect(trackServer).toHaveBeenCalledWith(
      USER_ID,
      "design.intake_checked",
      expect.objectContaining({
        conflicts: 1,
        conflict_kinds: ["setting"],
        venue_candidates: 1,
        notes_setting: "outdoor",
        setting: "indoor",
      }),
    );
  });

  it("reports a failure and answers with a stable code, not the provider's words", async () => {
    checkIntake.mockRejectedValueOnce(new Error('LLM 402: {"error":"credits"}'));
    const err = await caller().checkIntake(INPUT).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "INTAKE_FAILED" });
    expect(reportError).toHaveBeenCalledWith(
      "ai.intake_failed",
      expect.any(Error),
      expect.objectContaining({ userId: USER_ID }),
    );
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("takes at most ten references", async () => {
    const references = Array.from({ length: 11 }, () => INPUT.references[0]);
    await expect(caller().checkIntake({ ...INPUT, references })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(checkIntake).not.toHaveBeenCalled();
  });
});

describe("ai.renderScene with the intake brief", () => {
  const RENDER = {
    eventType: "wedding" as const,
    setting: "outdoor" as const,
    size: "large" as const,
    guestCount: 180,
    palette: { colors: ["#fdf8f0"] },
    references: [{ url: "https://res.cloudinary.com/zaffa/ref.jpg", category: "flowers" as const }],
    styleNotes: INPUT.styleNotes,
  };

  it("hands the brief to the prompt next to the raw notes", async () => {
    await caller().renderScene({ ...RENDER, briefEn: "  Secret garden, chandeliers in the trees.  " });
    expect(renderScene).toHaveBeenCalledWith(
      expect.objectContaining({
        briefEn: "Secret garden, chandeliers in the trees.",
        styleNotes: INPUT.styleNotes,
      }),
    );
    expect(trackServer).toHaveBeenCalledWith(
      USER_ID,
      "design.render_generated",
      expect.objectContaining({ has_brief: true }),
    );
  });

  it("hands it to the dress-venue prompt too", async () => {
    const publicId = `zaffa-venues/${USER_ID}/lawn`;
    prismaMock.venueDesign.findFirst.mockResolvedValue({
      id: DESIGN_ID,
      venue_photo: {
        url: `https://res.cloudinary.com/zaffa/image/upload/v1/${publicId}.jpg`,
        publicId,
        width: 1600,
        height: 1200,
      },
    } as never);
    prismaMock.venueDesignMedia.create.mockResolvedValue({ id: randomUUID() } as never);
    prismaMock.venueDesign.update.mockResolvedValue({ id: DESIGN_ID } as never);
    dressVenueScene.mockResolvedValue({
      imageUrl: "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-renders/d.png",
      publicId: "zaffa-renders/d",
      text: null,
      model: "openai/gpt-image-2.5-sunburst",
      costUsd: 0.057,
    });
    await caller().renderScene({ ...RENDER, designId: DESIGN_ID, briefEn: "White roses." });
    expect(dressVenueScene).toHaveBeenCalledWith(
      expect.objectContaining({ briefEn: "White roses." }),
      expect.anything(),
    );
  });

  it("refuses a brief longer than 1200 characters", async () => {
    await expect(
      caller().renderScene({ ...RENDER, briefEn: "x".repeat(1201) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(renderScene).not.toHaveBeenCalled();
  });
});
