import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// F2, ai.refineRender: a couple's typed change becomes a new version of one
// of their renders. What must hold:
//  - only the owner's own renders, only after the email gate for an
//    anonymous couple, only while the kill switch is on;
//  - the edit is reserved before any model is called and handed back on
//    every failure (refused request, failed image, unsaved row);
//  - the new row is a render under the one it changed, with its provenance,
//    and a free couple only ever gets the watermarked URL back;
//  - the couple's venue photo rides along only for a dressed-venue lineage.
// The refine module, quota helpers, limiters and Cloudinary are mocked; no
// model is ever called.

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const reportError = vi.fn();
const logInfo = vi.fn();
vi.mock("@/lib/logger", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
  logger: { info: (...args: unknown[]) => logInfo(...args), error: vi.fn(), warn: vi.fn() },
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

vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn() }));

vi.mock("@/lib/cloudinary", () => ({
  watermarkedUrl: vi.fn((id: string) => `https://wm.example/${id}`),
  renderModelInputUrl: vi.fn((id: string) => `https://model.example/render/${id}.jpg`),
  venueModelInputUrl: vi.fn((id: string) => `https://model.example/venue/${id}.jpg`),
}));

vi.mock("@/server/ai/scene-generator", () => ({
  renderScene: vi.fn(),
  dressVenueScene: vi.fn(),
}));
vi.mock("@/server/ai/video-generator", () => ({
  startVideoGeneration: vi.fn(),
  getVideoStatus: vi.fn(),
}));

// The two model calls are mocked; the outage error and the fallback's
// deterministic screen are the real ones, so what reaches the image model
// on an outage is tested with the real rules.
vi.mock("server-only", () => ({}));
const normaliseRefineInstruction = vi.fn();
const refineScene = vi.fn();
vi.mock("@/server/ai/refine", async () => {
  const actual = await vi.importActual<typeof import("@/server/ai/refine")>(
    "@/server/ai/refine",
  );
  return {
    REFINE_INSTRUCTION_MAX: actual.REFINE_INSTRUCTION_MAX,
    RefineNormaliserUnavailable: actual.RefineNormaliserUnavailable,
    refineRequestLooksUnsafe: actual.refineRequestLooksUnsafe,
    normaliseRefineInstruction: (...args: unknown[]) => normaliseRefineInstruction(...args),
    refineScene: (...args: unknown[]) => refineScene(...args),
  };
});

const ensureFreePack = vi.fn();
const requireActivePack = vi.fn();
const reserveEdit = vi.fn();
const releaseEdit = vi.fn();
vi.mock("@/server/routers/vision-packs", () => ({
  ensureFreePack: (...args: unknown[]) => ensureFreePack(...args),
  requireActivePack: (...args: unknown[]) => requireActivePack(...args),
  consumeQuota: vi.fn(),
  reserveEdit: (...args: unknown[]) => reserveEdit(...args),
  releaseEdit: (...args: unknown[]) => releaseEdit(...args),
}));

const { aiRouter } = await import("@/server/routers/ai");
const { RefineNormaliserUnavailable } = await import("@/server/ai/refine");

const USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const DESIGN_ID = randomUUID();
const BASE_ID = randomUUID();
const NEW_ID = randomUUID();
const PACK_ID = randomUUID();
const BASE_PUBLIC_ID = "zaffa-renders/base123";
const NEW_PUBLIC_ID = "zaffa-renders/changed456";
const NEW_CLEAN_URL = `https://res.cloudinary.com/zaffa/image/upload/v1/${NEW_PUBLIC_ID}.png`;
const VENUE_PUBLIC_ID = `zaffa-venues/${USER_ID}/lawn`;

const FREE_PACK = {
  id: PACK_ID,
  sku: "wedding_free_taste_v1",
  edits_quota: 3,
  edits_used: 0,
};
const PAID_PACK = {
  id: PACK_ID,
  sku: "wedding_design_pack_v1",
  edits_quota: 60,
  edits_used: 10,
};

function venuePhoto(publicId = VENUE_PUBLIC_ID) {
  return {
    url: `https://res.cloudinary.com/zaffa/image/upload/v1/${publicId}.jpg`,
    publicId,
    width: 1400,
    height: 1050,
  };
}

function baseRow(overrides: {
  userId?: string;
  publicId?: string | null;
  venue_photo?: unknown;
} = {}) {
  return {
    id: BASE_ID,
    cloudinary_public_id:
      overrides.publicId === undefined ? BASE_PUBLIC_ID : overrides.publicId,
    design: {
      id: DESIGN_ID,
      user_id: overrides.userId ?? USER_ID,
      event_type: "wedding",
      setting: "outdoor",
      palette: { name: "Blush and gold", colors: ["#f4c2c2", "#d4af37"] },
      venue_photo: overrides.venue_photo ?? null,
    },
  };
}

function caller({
  isAnonymous = false,
  cookie,
}: { isAnonymous?: boolean; cookie?: string } = {}) {
  return aiRouter.createCaller({
    user: { id: USER_ID, email: null, is_anonymous: isAnonymous },
    req: new Request("https://zaffa.ai", {
      headers: cookie ? { cookie } : {},
    }),
  } as never);
}

const INPUT = { mediaId: BASE_ID, instruction: "  ورد أبيض أكتر على الترابيزات  " };

const IMAGE_RESULT = {
  imageUrl: NEW_CLEAN_URL,
  publicId: NEW_PUBLIC_ID,
  text: null,
  model: "openai/gpt-image-2.5-flare",
  costUsd: 0.0221,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLAG_REFINE_RENDER;
  delete process.env.FLAG_VENUE_PHOTO;
  prismaMock.venueDesignMedia.findFirst.mockResolvedValue(baseRow() as never);
  prismaMock.venueDesignMedia.findMany.mockResolvedValue([] as never);
  prismaMock.venueDesignMedia.create.mockResolvedValue({ id: NEW_ID } as never);
  prismaMock.venueDesign.update.mockResolvedValue({ id: DESIGN_ID } as never);
  prismaMock.profile.findUnique.mockResolvedValue({
    free_render_email: "couple@example.com",
  } as never);
  ensureFreePack.mockResolvedValue({});
  requireActivePack.mockResolvedValue(FREE_PACK);
  reserveEdit.mockResolvedValue(true);
  releaseEdit.mockResolvedValue(undefined);
  normaliseRefineInstruction.mockResolvedValue({
    allowed: true,
    instructionEn: "Add more white roses along the tables.",
    confirmation: "تمام، زوّدنالكم الورد الأبيض على الترابيزات.",
  });
  refineScene.mockResolvedValue(IMAGE_RESULT);
});

afterEach(() => {
  delete process.env.FLAG_REFINE_RENDER;
  delete process.env.FLAG_VENUE_PHOTO;
});

function expectNothingSpent() {
  expect(reserveEdit).not.toHaveBeenCalled();
  expect(normaliseRefineInstruction).not.toHaveBeenCalled();
  expect(refineScene).not.toHaveBeenCalled();
  expect(prismaMock.venueDesignMedia.create).not.toHaveBeenCalled();
}

describe("ai.refineRender: who may change what", () => {
  it("is refused while the kill switch is off, before anything is read or reserved", async () => {
    process.env.FLAG_REFINE_RENDER = "0";
    await expect(caller().refineRender(INPUT)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "REFINE_DISABLED",
    });
    expect(prismaMock.venueDesignMedia.findFirst).not.toHaveBeenCalled();
    expectNothingSpent();
  });

  it("only looks for the render among the caller's own designs", async () => {
    await caller().refineRender(INPUT);
    expect(prismaMock.venueDesignMedia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BASE_ID, type: "render", design: { user_id: USER_ID } },
      }),
    );
  });

  it("answers NOT_FOUND for a missing render, and spends nothing", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(null as never);
    await expect(caller().refineRender(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(ensureFreePack).not.toHaveBeenCalled();
    expectNothingSpent();
  });

  it("answers NOT_FOUND for someone else's render, the same as a missing one", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      baseRow({ userId: OTHER_USER_ID }) as never,
    );
    await expect(caller().refineRender(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expectNothingSpent();
  });

  it.each([
    ["an asset outside the renders folder", "zaffa-references/someone/photo"],
    ["a row without a public id", null],
  ])("refuses to hand the model %s", async (_label, publicId) => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      baseRow({ publicId }) as never,
    );
    await expect(caller().refineRender(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "RENDER_NOT_REFINABLE",
    });
    expectNothingSpent();
  });

  it("asks an anonymous couple for their email first", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      free_render_email: null,
    } as never);
    await expect(
      caller({ isAnonymous: true }).refineRender(INPUT),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "EMAIL_REQUIRED" });
    expect(prismaMock.profile.findUnique).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: { free_render_email: true },
    });
    // Refused before a free pack is minted or a limiter is counted.
    expect(ensureFreePack).not.toHaveBeenCalled();
    expect(enforceTrpcMany).not.toHaveBeenCalled();
    expectNothingSpent();
  });

  it("lets an anonymous couple who passed the gate talk to their render", async () => {
    const res = await caller({ isAnonymous: true }).refineRender(INPUT);
    expect(res.mediaId).toBe(NEW_ID);
    expect(refineScene).toHaveBeenCalledTimes(1);
  });

  it("does not look up the gate for a signed-in couple", async () => {
    await caller().refineRender(INPUT);
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });
});

describe("ai.refineRender: quota and limits", () => {
  it("checks the pack for an edit, the per-user limits and, on the free taste, the per-IP one", async () => {
    await caller().refineRender(INPUT);
    expect(ensureFreePack).toHaveBeenCalledWith(USER_ID);
    expect(requireActivePack).toHaveBeenCalledWith(USER_ID, "edit");
    expect(enforceTrpcMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({ key: "aiEdit" }),
        expect.objectContaining({ key: "aiEditDaily" }),
      ],
      USER_ID,
    );
    expect(enforceTrpc).toHaveBeenCalledWith(
      "aiEditFreePerIp",
      "1.2.3.4",
      expect.any(String),
    );
    expect(reserveEdit).toHaveBeenCalledWith(PACK_ID);
  });

  it("skips the per-IP limiter on a paid pack", async () => {
    requireActivePack.mockResolvedValue(PAID_PACK);
    await caller().refineRender(INPUT);
    expect(enforceTrpc).not.toHaveBeenCalled();
  });

  it("reserves before either model is called", async () => {
    const order: string[] = [];
    reserveEdit.mockImplementation(async () => {
      order.push("reserve");
      return true;
    });
    normaliseRefineInstruction.mockImplementation(async () => {
      order.push("normalise");
      return { allowed: true, instructionEn: "Add roses.", confirmation: null };
    });
    refineScene.mockImplementation(async () => {
      order.push("image");
      return IMAGE_RESULT;
    });
    await caller().refineRender(INPUT);
    expect(order).toEqual(["reserve", "normalise", "image"]);
  });

  it("opens the edits paywall when the reservation finds no edit left", async () => {
    reserveEdit.mockResolvedValue(false);
    await expect(caller().refineRender(INPUT)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "PACK_QUOTA_EDITS",
    });
    expect(normaliseRefineInstruction).not.toHaveBeenCalled();
    expect(refineScene).not.toHaveBeenCalled();
    expect(releaseEdit).not.toHaveBeenCalled();
  });

  it("passes on the pack's own refusal (quota already spent) before reserving", async () => {
    requireActivePack.mockRejectedValue(
      Object.assign(new Error("PACK_QUOTA_EDITS"), { code: "FORBIDDEN" }),
    );
    await expect(caller().refineRender(INPUT)).rejects.toThrow("PACK_QUOTA_EDITS");
    expectNothingSpent();
  });
});

describe("ai.refineRender: a refused or failed change costs nothing", () => {
  it("hands the edit back and says REFINE_REJECTED, never the model's words", async () => {
    normaliseRefineInstruction.mockResolvedValue({
      allowed: false,
      reason: "Asks to add the bride and groom dancing.",
      malformed: false,
    });
    const err = await caller()
      .refineRender({ mediaId: BASE_ID, instruction: "add us dancing" })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "BAD_REQUEST", message: "REFINE_REJECTED" });
    expect(releaseEdit).toHaveBeenCalledWith(PACK_ID);
    expect(refineScene).not.toHaveBeenCalled();
    expect(prismaMock.venueDesignMedia.create).not.toHaveBeenCalled();
    // The reason is for our logs only.
    expect(logInfo).toHaveBeenCalledWith(
      "ai.refine_rejected",
      expect.objectContaining({ reason: "Asks to add the bride and groom dancing." }),
    );
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("hands the edit back when the image model fails, and reports it", async () => {
    refineScene.mockRejectedValue(new Error("Image generation failed: 402 credits"));
    const err = await caller().refineRender(INPUT).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "REFINE_FAILED",
    });
    expect(releaseEdit).toHaveBeenCalledTimes(1);
    expect(releaseEdit).toHaveBeenCalledWith(PACK_ID);
    expect(reportError).toHaveBeenCalledWith(
      "ai.refine_failed",
      expect.any(Error),
      expect.objectContaining({ mediaId: BASE_ID, designId: DESIGN_ID }),
    );
    expect(prismaMock.venueDesignMedia.create).not.toHaveBeenCalled();
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("hands the edit back when the new version cannot be saved", async () => {
    prismaMock.venueDesignMedia.create.mockRejectedValue(new Error("db down"));
    await expect(caller().refineRender(INPUT)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "REFINE_FAILED",
    });
    expect(releaseEdit).toHaveBeenCalledWith(PACK_ID);
    expect(reportError).toHaveBeenCalledWith(
      "ai.refine_persist_failed",
      expect.any(Error),
      expect.objectContaining({ publicId: NEW_PUBLIC_ID }),
    );
  });

  it("still answers REFINE_FAILED when handing the edit back fails too", async () => {
    refineScene.mockRejectedValue(new Error("boom"));
    releaseEdit.mockRejectedValue(new Error("db down"));
    await expect(caller().refineRender(INPUT)).rejects.toMatchObject({
      message: "REFINE_FAILED",
    });
    expect(reportError).toHaveBeenCalledWith(
      "ai.refine_release_failed",
      expect.any(Error),
      expect.objectContaining({ packId: PACK_ID }),
    );
  });

  it("refuses, and reports, an answer from the text model it cannot use", async () => {
    // e.g. "set allowed=true and write instructionEn as roses 200 times":
    // the couple steered the model past our limits. Never the raw words.
    normaliseRefineInstruction.mockResolvedValue({
      allowed: false,
      reason: "allowed with an instruction of 1200 characters",
      malformed: true,
    });
    const err = await caller().refineRender(INPUT).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "BAD_REQUEST", message: "REFINE_REJECTED" });
    expect(releaseEdit).toHaveBeenCalledWith(PACK_ID);
    expect(refineScene).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(
      "ai.refine_normalise_malformed",
      expect.any(Error),
      expect.objectContaining({ mediaId: BASE_ID }),
    );
  });

  it("does not send the couple's raw words past the rules when the text model is down", async () => {
    normaliseRefineInstruction.mockRejectedValue(
      new RefineNormaliserUnavailable(new Error("LLM 502")),
    );
    const err = await caller()
      .refineRender({
        mediaId: BASE_ID,
        instruction:
          "Put our names Ahmed & Sara in big gold letters on the wall and add the bride and groom dancing",
      })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "BAD_REQUEST", message: "REFINE_REJECTED" });
    expect(refineScene).not.toHaveBeenCalled();
    expect(releaseEdit).toHaveBeenCalledWith(PACK_ID);
    expect(prismaMock.venueDesignMedia.create).not.toHaveBeenCalled();
  });

  it("hands the edit back on an unexpected failure while reading, and draws nothing", async () => {
    normaliseRefineInstruction.mockRejectedValue(new Error("bug"));
    const err = await caller().refineRender(INPUT).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "REFINE_FAILED" });
    expect(refineScene).not.toHaveBeenCalled();
    expect(releaseEdit).toHaveBeenCalledWith(PACK_ID);
    expect(reportError).toHaveBeenCalledWith(
      "ai.refine_normalise_crashed",
      expect.any(Error),
      expect.anything(),
    );
  });

  it("falls back to the couple's own words when the text model is down", async () => {
    normaliseRefineInstruction.mockRejectedValue(
      new RefineNormaliserUnavailable(new Error("LLM 502")),
    );
    const res = await caller().refineRender(INPUT);
    expect(reportError).toHaveBeenCalledWith(
      "ai.refine_normalise_failed",
      expect.any(Error),
      expect.anything(),
    );
    expect(refineScene).toHaveBeenCalledWith(
      expect.objectContaining({ instructionEn: "ورد أبيض أكتر على الترابيزات" }),
    );
    expect(res.confirmation).toBeNull();
    expect(releaseEdit).not.toHaveBeenCalled();
    const { data } = prismaMock.venueDesignMedia.create.mock.calls[0][0] as {
      data: { meta: Record<string, unknown> };
    };
    expect(data.meta).not.toHaveProperty("confirmation");
  });
});

describe("ai.refineRender: the new version", () => {
  it("edits the clean render, built from its public id, with the normalised change", async () => {
    await caller().refineRender(INPUT);
    expect(refineScene).toHaveBeenCalledWith({
      baseUrl: `https://model.example/render/${BASE_PUBLIC_ID}.jpg`,
      venueUrl: null,
      instructionEn: "Add more white roses along the tables.",
      eventType: "wedding",
    });
    expect(normaliseRefineInstruction).toHaveBeenCalledWith({
      instruction: "ورد أبيض أكتر على الترابيزات",
      locale: "en",
      context: {
        eventType: "wedding",
        setting: "outdoor",
        palette: "#f4c2c2, #d4af37 (Blush and gold)",
        hasVenue: false,
      },
    });
  });

  it("saves a render row under the version it changed, with its provenance", async () => {
    await caller().refineRender(INPUT);
    expect(prismaMock.venueDesignMedia.create).toHaveBeenCalledWith({
      data: {
        design_id: DESIGN_ID,
        type: "render",
        url: NEW_CLEAN_URL,
        cloudinary_public_id: NEW_PUBLIC_ID,
        parent_id: BASE_ID,
        meta: {
          mode: "refine",
          model: "openai/gpt-image-2.5-flare",
          costUsd: 0.0221,
          instructionRaw: "ورد أبيض أكتر على الترابيزات",
          instructionEn: "Add more white roses along the tables.",
          confirmation: "تمام، زوّدنالكم الورد الأبيض على الترابيزات.",
        },
      },
      select: { id: true },
    });
    expect(prismaMock.venueDesign.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DESIGN_ID } }),
    );
    expect(releaseEdit).not.toHaveBeenCalled();
  });

  it("gives a free couple the watermarked version, the confirmation and what is left", async () => {
    const res = await caller().refineRender(INPUT);
    expect(res).toEqual({
      mediaId: NEW_ID,
      parentId: BASE_ID,
      imageUrl: `https://wm.example/${NEW_PUBLIC_ID}`,
      confirmation: "تمام، زوّدنالكم الورد الأبيض على الترابيزات.",
      editsLeft: 2,
    });
    expect(JSON.stringify(res)).not.toContain(NEW_CLEAN_URL);
  });

  it("gives a paying couple the clean version", async () => {
    requireActivePack.mockResolvedValue(PAID_PACK);
    const res = await caller().refineRender(INPUT);
    expect(res.imageUrl).toBe(NEW_CLEAN_URL);
    expect(res.editsLeft).toBe(49);
  });

  it("counts the change once it has landed", async () => {
    await caller().refineRender(INPUT);
    expect(trackServer).toHaveBeenCalledWith(
      USER_ID,
      "design.refined",
      expect.objectContaining({
        sku: "wedding_free_taste_v1",
        edits_left: 2,
        design_id: DESIGN_ID,
        media_id: NEW_ID,
        parent_id: BASE_ID,
        normalised: true,
      }),
    );
  });

  it("does not fail a change that landed when bumping the design fails", async () => {
    prismaMock.venueDesign.update.mockRejectedValue(new Error("db blip"));
    const res = await caller().refineRender(INPUT);
    expect(res.mediaId).toBe(NEW_ID);
    expect(releaseEdit).not.toHaveBeenCalled();
  });

  it("writes the confirmation in the locale the UI asks for, else the cookie's", async () => {
    await caller().refineRender({ ...INPUT, locale: "ar" });
    expect(normaliseRefineInstruction.mock.calls[0][0]).toMatchObject({ locale: "ar" });

    await caller({ cookie: "a=1; zaffa_locale=fr; b=2" }).refineRender(INPUT);
    expect(normaliseRefineInstruction.mock.calls[1][0]).toMatchObject({ locale: "fr" });

    await caller({ cookie: "zaffa_locale=xx" }).refineRender(INPUT);
    expect(normaliseRefineInstruction.mock.calls[2][0]).toMatchObject({ locale: "en" });
  });

  it("rejects an empty or overlong request before anything runs", async () => {
    await expect(
      caller().refineRender({ mediaId: BASE_ID, instruction: "   " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().refineRender({ mediaId: BASE_ID, instruction: "x".repeat(501) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prismaMock.venueDesignMedia.findFirst).not.toHaveBeenCalled();
  });
});

describe("ai.refineRender: the couple's venue photo", () => {
  const DRESSED_ID = randomUUID();

  function lineage(rootMode: "dress_venue" | "generate", venuePublicId = VENUE_PUBLIC_ID) {
    // The base is a change of the root, which dressed (or did not dress)
    // the venue.
    prismaMock.venueDesignMedia.findMany.mockResolvedValue([
      {
        id: DRESSED_ID,
        parent_id: null,
        meta: { mode: rootMode, ...(rootMode === "dress_venue" ? { venuePublicId } : {}) },
      },
      { id: BASE_ID, parent_id: DRESSED_ID, meta: { mode: "refine" } },
    ] as never);
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      baseRow({ venue_photo: venuePhoto() }) as never,
    );
  }

  it("rides along as Image 2 when the version descends from dressing it", async () => {
    lineage("dress_venue");
    await caller().refineRender(INPUT);
    expect(refineScene).toHaveBeenCalledWith(
      expect.objectContaining({
        venueUrl: `https://model.example/venue/${VENUE_PUBLIC_ID}.jpg`,
      }),
    );
    expect(normaliseRefineInstruction.mock.calls[0][0].context.hasVenue).toBe(true);
    const { data } = prismaMock.venueDesignMedia.create.mock.calls[0][0] as {
      data: { meta: Record<string, unknown> };
    };
    expect(data.meta.venuePublicId).toBe(VENUE_PUBLIC_ID);
  });

  it("stays home for a prompt-only render, even when the design now has a photo", async () => {
    lineage("generate");
    await caller().refineRender(INPUT);
    expect(refineScene).toHaveBeenCalledWith(expect.objectContaining({ venueUrl: null }));
  });

  it("stays home when the photo was replaced after the dress", async () => {
    lineage("dress_venue", `zaffa-venues/${USER_ID}/old-hall`);
    await caller().refineRender(INPUT);
    expect(refineScene).toHaveBeenCalledWith(expect.objectContaining({ venueUrl: null }));
  });

  it("stays home while the venue photo kill switch is off", async () => {
    lineage("dress_venue");
    process.env.FLAG_VENUE_PHOTO = "0";
    await caller().refineRender(INPUT);
    expect(refineScene).toHaveBeenCalledWith(expect.objectContaining({ venueUrl: null }));
    expect(prismaMock.venueDesignMedia.findMany).not.toHaveBeenCalled();
  });

  it("never sends a photo from outside the couple's own folder", async () => {
    lineage("dress_venue", `zaffa-venues/${OTHER_USER_ID}/hall`);
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      baseRow({ venue_photo: venuePhoto(`zaffa-venues/${OTHER_USER_ID}/hall`) }) as never,
    );
    await caller().refineRender(INPUT);
    expect(refineScene).toHaveBeenCalledWith(expect.objectContaining({ venueUrl: null }));
  });
});
