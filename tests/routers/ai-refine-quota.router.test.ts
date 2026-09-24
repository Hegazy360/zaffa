import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// F2: which paywall a couple meets when their changes run out, with the
// real pack helpers (ensureFreePack, requireActivePack, reserveEdit,
// releaseEdit) over an in-memory `vision_packs` table, through the real
// `ai.refineRender`. `reserveEdit` flips a pack to `fulfilled` on the edit
// that leaves nothing on it, so the next change finds no `active` pack; it
// must still say "you've used all your design changes" (PACK_QUOTA_EDITS)
// and not the generic "Unlock generation" (PACK_REQUIRED). The two model
// calls, limiters and Cloudinary are mocked; nothing leaves the process.

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/posthog", () => ({ captureServer: vi.fn(), trackServer: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  enforceTrpc: vi.fn(),
  enforceTrpcMany: vi.fn(),
  ipFromRequest: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({
  cloudinary: { uploader: { upload: vi.fn() } },
  watermarkedUrl: vi.fn((id: string) => `https://wm.example/${id}`),
  renderModelInputUrl: vi.fn((id: string) => `https://model.example/${id}.jpg`),
  venueModelInputUrl: vi.fn((id: string) => `https://model.example/${id}.jpg`),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: vi.fn() } } }),
}));
vi.mock("@/server/services/notifications/dispatchers", () => ({
  notifyEventInServiceArea: vi.fn(),
  notifyDesignApproved: vi.fn(),
}));
vi.mock("@/server/ai/scene-generator", () => ({
  renderScene: vi.fn(),
  dressVenueScene: vi.fn(),
}));
vi.mock("@/server/ai/video-generator", () => ({
  startVideoGeneration: vi.fn(),
  getVideoStatus: vi.fn(),
}));

const normaliseRefineInstruction = vi.fn();
const refineScene = vi.fn();
vi.mock("@/server/ai/refine", async () => {
  const actual = await vi.importActual<typeof import("@/server/ai/refine")>(
    "@/server/ai/refine",
  );
  return {
    ...actual,
    normaliseRefineInstruction: (...args: unknown[]) => normaliseRefineInstruction(...args),
    refineScene: (...args: unknown[]) => refineScene(...args),
  };
});

const { aiRouter } = await import("@/server/routers/ai");

const USER_ID = randomUUID();
const DESIGN_ID = randomUUID();
const BASE_ID = randomUUID();
const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-09-22T10:00:00.000Z");

// ---- a tiny `vision_packs` table ------------------------------------------
// The query shapes the pack helpers use, and the two raw statements
// (`reserveEdit`, `releaseEdit`) re-implemented from their SQL. Anything
// else throws, so a new query shape cannot pass by being mis-read.

type Row = {
  id: string;
  recipient_user_id: string;
  sku: string;
  status: string;
  paid_at: Date;
  expires_at: Date | null;
  renders_quota: number;
  renders_used: number;
  videos_quota: number;
  videos_used: number;
  edits_quota: number;
  edits_used: number;
};
let table: Row[] = [];

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") {
      return (cond as Record<string, unknown>[]).some((w) => matches(row, w));
    }
    const value = (row as unknown as Record<string, unknown>)[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; gt?: number };
      if (c.in) return c.in.includes(value);
      if (c.gt !== undefined) return (value as number) > c.gt;
      throw new Error(`pack table: unsupported condition on ${key}`);
    }
    return value === cond;
  });
}

function installTable() {
  prismaMock.visionPack.findFirst.mockImplementation((async (args: {
    where: Record<string, unknown>;
    orderBy?: { paid_at?: "desc" };
  }) => {
    const rows = table.filter((r) => matches(r, args.where));
    if (args.orderBy?.paid_at === "desc") {
      rows.sort((a, b) => b.paid_at.getTime() - a.paid_at.getTime());
    }
    return rows[0] ? { ...rows[0] } : null;
  }) as never);
  prismaMock.visionPack.create.mockImplementation((async () => {
    throw new Error("pack table: no pack should be minted in these tests");
  }) as never);
  prismaMock.visionPack.update.mockImplementation((async (args: {
    where: { id: string };
    data: Partial<Row>;
  }) => {
    const row = table.find((r) => r.id === args.where.id);
    if (!row) throw new Error("P2025");
    Object.assign(row, args.data);
    return { ...row };
  }) as never);
  prismaMock.$queryRaw.mockImplementation((async (query: {
    sql: string;
    values: unknown[];
  }) => {
    if (!/SET edits_used = edits_used \+ 1/.test(query.sql)) {
      throw new Error("pack table: unsupported raw query");
    }
    const row = table.find((r) => r.id === query.values[0]);
    if (!row || row.status !== "active" || row.edits_used >= row.edits_quota) {
      return [];
    }
    const spent =
      row.renders_used >= row.renders_quota &&
      row.videos_used >= row.videos_quota &&
      row.edits_used + 1 >= row.edits_quota;
    row.edits_used += 1;
    if (spent) row.status = "fulfilled";
    return [{ id: row.id }];
  }) as never);
  prismaMock.$executeRaw.mockImplementation((async (query: {
    sql: string;
    values: unknown[];
  }) => {
    if (!/SET edits_used = GREATEST\(edits_used - 1, 0\)/.test(query.sql)) {
      throw new Error("pack table: unsupported raw statement");
    }
    const row = table.find((r) => r.id === query.values[0]);
    if (!row) return 0;
    const inWindow = !row.expires_at || row.expires_at.getTime() > Date.now();
    if (row.status === "fulfilled" && row.edits_used > 0 && inWindow) {
      row.status = "active";
    }
    row.edits_used = Math.max(row.edits_used - 1, 0);
    return 1;
  }) as never);
}

function seed(overrides: Partial<Row>): Row {
  const row: Row = {
    id: randomUUID(),
    recipient_user_id: USER_ID,
    sku: "wedding_design_pack_v1",
    status: "active",
    paid_at: T0,
    expires_at: new Date(T0.getTime() + 60 * DAY),
    renders_quota: 20,
    renders_used: 20,
    videos_quota: 2,
    videos_used: 2,
    edits_quota: 60,
    edits_used: 0,
    ...overrides,
  };
  table.push(row);
  return row;
}

// The free taste after its one render: 1/1, 0/0, and three changes.
function seedFreeTaste(overrides: Partial<Row> = {}): Row {
  return seed({
    sku: "wedding_free_taste_v1",
    expires_at: new Date(T0.getTime() + 7 * DAY),
    renders_quota: 1,
    renders_used: 1,
    videos_quota: 0,
    videos_used: 0,
    edits_quota: 3,
    edits_used: 0,
    ...overrides,
  });
}

function change() {
  return aiRouter
    .createCaller({
      user: { id: USER_ID, email: "noor@example.com", is_anonymous: false },
      req: new Request("https://zaffa.ai"),
    } as never)
    .refineRender({ mediaId: BASE_ID, instruction: "More white roses" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  table = [];
  installTable();
  prismaMock.venueDesignMedia.findFirst.mockResolvedValue({
    id: BASE_ID,
    cloudinary_public_id: "zaffa-renders/base",
    design: {
      id: DESIGN_ID,
      user_id: USER_ID,
      event_type: "wedding",
      setting: "outdoor",
      palette: null,
      venue_photo: null,
    },
  } as never);
  prismaMock.venueDesignMedia.create.mockImplementation((async () => ({
    id: randomUUID(),
  })) as never);
  prismaMock.venueDesign.update.mockResolvedValue({ id: DESIGN_ID } as never);
  normaliseRefineInstruction.mockResolvedValue({
    allowed: true,
    instructionEn: "Add more white roses.",
    confirmation: "Done: more white roses.",
  });
  refineScene.mockResolvedValue({
    imageUrl: "https://res.cloudinary.com/demo/image/upload/v1/zaffa-renders/new.png",
    publicId: "zaffa-renders/new",
    text: null,
    model: "openai/gpt-image-2.5-flare",
    costUsd: 0.022,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ai.refineRender when the changes run out", () => {
  it("shows a free couple the changes paywall after their third change, not the generic one", async () => {
    const pack = seedFreeTaste();
    for (let i = 0; i < 3; i++) await change();
    // The third change left nothing on the pack.
    expect(pack).toMatchObject({ edits_used: 3, status: "fulfilled" });

    await expect(change()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "PACK_QUOTA_EDITS",
    });
    expect(normaliseRefineInstruction).toHaveBeenCalledTimes(3);
    expect(refineScene).toHaveBeenCalledTimes(3);
    expect(pack.edits_used).toBe(3);
  });

  it("shows a paying couple the changes paywall after their last change", async () => {
    const pack = seed({ edits_used: 59 });
    await change();
    expect(pack).toMatchObject({ edits_used: 60, status: "fulfilled" });
    await expect(change()).rejects.toMatchObject({ message: "PACK_QUOTA_EDITS" });
    expect(refineScene).toHaveBeenCalledTimes(1);
  });

  it("reopens the pack when the last change fails, so the couple can try again", async () => {
    const pack = seedFreeTaste({ edits_used: 2 });
    refineScene.mockRejectedValueOnce(new Error("Image generation failed"));
    await expect(change()).rejects.toMatchObject({ message: "REFINE_FAILED" });
    expect(pack).toMatchObject({ edits_used: 2, status: "active" });
    await change();
    expect(pack).toMatchObject({ edits_used: 3, status: "fulfilled" });
  });

  it("answers PACK_REQUIRED once the spent pack's window has closed", async () => {
    seedFreeTaste({ edits_used: 3, status: "fulfilled" });
    vi.setSystemTime(new Date(T0.getTime() + 8 * DAY));
    await expect(change()).rejects.toMatchObject({ message: "PACK_REQUIRED" });
    expect(refineScene).not.toHaveBeenCalled();
  });

  it("answers PACK_REQUIRED to a couple who never had a pack with changes", async () => {
    // No active pack, and the only fulfilled one never offered edits.
    seed({
      status: "fulfilled",
      edits_quota: 0,
      edits_used: 0,
      paid_at: new Date(T0.getTime() - 400 * DAY),
      expires_at: new Date(T0.getTime() - 340 * DAY),
    });
    await expect(change()).rejects.toMatchObject({ message: "PACK_REQUIRED" });
  });
});
