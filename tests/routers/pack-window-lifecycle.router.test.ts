import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// What happens to a pack when its window closes, end to end. Edits count
// towards a pack being spent (F2), so a free taste with its one render
// used, or a paid pack at 20/20 renders and 2/2 videos, now stays `active`
// until its window ends instead of turning `fulfilled` on the spot. These
// tests drive the real pack helpers through the real `ai.renderScene` and
// `venueDesigns.getById`, over an in-memory `vision_packs` table, across
// the window's end, and pin: no second free pack, the old render still
// watermarked for free, and a paying couple's pack kept (microsite,
// lookbook, clean renders). The model and Cloudinary are mocked; nothing
// leaves the process.

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/posthog", () => ({
  captureServer: vi.fn(),
  trackServer: vi.fn(),
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
  cloudinary: { uploader: { upload: vi.fn() } },
  watermarkedUrl: vi.fn((id: string) => `https://wm.example/${id}`),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: vi.fn() } } }),
}));
vi.mock("@/server/services/notifications/dispatchers", () => ({
  notifyEventInServiceArea: vi.fn(),
  notifyDesignApproved: vi.fn(),
}));

const renderScene = vi.fn();
vi.mock("@/server/ai/scene-generator", () => ({
  renderScene: (...args: unknown[]) => renderScene(...args),
}));
vi.mock("@/server/ai/video-generator", () => ({
  startVideoGeneration: vi.fn(),
  getVideoStatus: vi.fn(),
}));

const { aiRouter } = await import("@/server/routers/ai");
const { venueDesignsRouter } = await import("@/server/routers/venue-designs");

const USER_ID = randomUUID();
const DESIGN_ID = randomUUID();
const PUBLIC_ID = "zaffa-renders/abc123";
const CLEAN_URL = `https://res.cloudinary.com/demo/image/upload/v1/${PUBLIC_ID}.png`;
const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-09-22T10:00:00.000Z");

const INPUT = {
  eventType: "wedding" as const,
  setting: "outdoor" as const,
  size: "medium" as const,
  palette: { colors: ["#ffffff"] },
  references: [
    { url: "https://res.cloudinary.com/demo/ref.jpg", category: "flowers" as const },
  ],
};

// ---- a tiny `vision_packs` table ------------------------------------------
// Understands exactly the query shapes the pack helpers use (equality,
// `in`, `gt`, `OR`, `paid_at desc`, `increment`), and throws on anything
// else so a new query shape cannot pass by being silently mis-read.

type Row = Record<string, unknown> & { id: string; paid_at: Date };
let table: Row[] = [];

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") {
      return (cond as Record<string, unknown>[]).some((w) => matches(row, w));
    }
    const value = row[key];
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
  prismaMock.visionPack.create.mockImplementation((async (args: {
    data: Record<string, unknown>;
  }) => {
    const row = {
      id: randomUUID(),
      renders_used: 0,
      videos_used: 0,
      edits_used: 0,
      ...args.data,
    } as unknown as Row;
    table.push(row);
    return { ...row };
  }) as never);
  prismaMock.visionPack.update.mockImplementation((async (args: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => {
    const row = table.find((r) => r.id === args.where.id);
    if (!row) throw new Error("P2025");
    for (const [key, value] of Object.entries(args.data)) {
      const inc = (value as { increment?: number } | null)?.increment;
      row[key] = inc !== undefined ? (row[key] as number) + inc : value;
    }
    return { ...row };
  }) as never);
  prismaMock.$transaction.mockImplementation((async (
    fn: (tx: typeof prismaMock) => Promise<unknown>,
  ) => fn(prismaMock)) as never);
}

function seed(overrides: Record<string, unknown>): Row {
  const row = {
    id: randomUUID(),
    recipient_user_id: USER_ID,
    buyer_user_id: USER_ID,
    sku: "wedding_design_pack_v1",
    status: "active",
    amount: 190000,
    paid_at: T0,
    expires_at: new Date(T0.getTime() + 60 * DAY),
    renders_quota: 20,
    renders_used: 0,
    videos_quota: 2,
    videos_used: 0,
    edits_quota: 60,
    edits_used: 0,
    ...overrides,
  } as Row;
  table.push(row);
  return row;
}

// ---- callers --------------------------------------------------------------

const ctx = {
  user: { id: USER_ID, email: "noor@example.com", is_anonymous: false },
  req: new Request("https://zaffa.ai"),
} as never;

function render() {
  return aiRouter.createCaller(ctx).renderScene(INPUT);
}

async function servedRenderUrl(): Promise<string | undefined> {
  prismaMock.venueDesign.findFirst.mockResolvedValue({
    id: DESIGN_ID,
    user_id: USER_ID,
    name: "Our lawn",
    venue_photo: null,
    selected_media_id: null,
    media: [
      {
        id: randomUUID(),
        design_id: DESIGN_ID,
        parent_id: null,
        type: "render",
        url: CLEAN_URL,
        cloudinary_public_id: PUBLIC_ID,
        created_at: T0,
        meta: null,
      },
    ],
  } as never);
  const design = await venueDesignsRouter
    .createCaller(ctx)
    .getById({ id: DESIGN_ID });
  return design?.media[0]?.url;
}

function advanceDays(days: number) {
  vi.setSystemTime(new Date(Date.now() + days * DAY));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  table = [];
  installTable();
  renderScene.mockResolvedValue({
    imageUrl: CLEAN_URL,
    publicId: PUBLIC_ID,
    text: null,
    model: "google/gemini-3-pro-image-preview",
    costUsd: 0.136232,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("a free taste across the end of its window", () => {
  it("never grants a second free pack, however often the couple presses Generate", async () => {
    const first = await render();
    expect(first.watermarked).toBe(true);
    expect(table).toHaveLength(1);
    // The render is spent but the three edits are not, so it stays open.
    expect(table[0]).toMatchObject({ status: "active", renders_used: 1 });

    advanceDays(8);
    for (let i = 0; i < 2; i++) {
      await expect(render()).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "PACK_REQUIRED",
      });
    }

    expect(renderScene).toHaveBeenCalledTimes(1);
    expect(prismaMock.visionPack.create).toHaveBeenCalledTimes(1);
    expect(table).toHaveLength(1);
    expect(table[0].status).toBe("fulfilled");

    // And a week later still nothing new.
    advanceDays(7);
    await expect(render()).rejects.toMatchObject({ message: "PACK_REQUIRED" });
    expect(table).toHaveLength(1);
  });

  it("keeps the old render watermarked after the window closes", async () => {
    await render();
    expect(await servedRenderUrl()).toBe(`https://wm.example/${PUBLIC_ID}`);

    advanceDays(8);
    await expect(render()).rejects.toMatchObject({ message: "PACK_REQUIRED" });

    expect(await servedRenderUrl()).toBe(`https://wm.example/${PUBLIC_ID}`);
  });

  it("still owes the taste when the pack that expired never produced anything", async () => {
    // The only render failed, then the window ran out.
    seed({
      sku: "wedding_free_taste_v1",
      amount: 0,
      status: "expired",
      renders_quota: 1,
      videos_quota: 0,
      edits_quota: 3,
      expires_at: new Date(T0.getTime() - DAY),
      paid_at: new Date(T0.getTime() - 8 * DAY),
    });
    const res = await render();
    expect(res.watermarked).toBe(true);
    expect(table).toHaveLength(2);
    expect(renderScene).toHaveBeenCalledTimes(1);
  });
});

describe("a paid pack across the end of its window", () => {
  it("closes a spent pack held open by unused edits as fulfilled, with no free pack after it", async () => {
    seed({ renders_used: 19, videos_used: 2 });
    const last = await render();
    expect(last.watermarked).toBe(false);
    // 20/20 and 2/2, but 0/60 edits: still active.
    expect(table[0]).toMatchObject({ status: "active", renders_used: 20 });

    advanceDays(61);
    await expect(render()).rejects.toMatchObject({
      message: "PACK_WINDOW_EXPIRED",
    });
    // `fulfilled` is what /v/[slug], the lookbook route and the gallery
    // accept, so the couple keeps their microsite and lookbook.
    expect(table[0].status).toBe("fulfilled");

    await expect(render()).rejects.toMatchObject({ message: "PACK_REQUIRED" });
    expect(prismaMock.visionPack.create).not.toHaveBeenCalled();
    expect(table).toHaveLength(1);
    expect(await servedRenderUrl()).toBe(CLEAN_URL);
  });

  it("gives no free pack, and no watermark, to a couple whose used pack an older build expired", async () => {
    seed({
      status: "expired",
      renders_used: 5,
      paid_at: new Date(T0.getTime() - 70 * DAY),
      expires_at: new Date(T0.getTime() - 10 * DAY),
    });
    await expect(render()).rejects.toMatchObject({ message: "PACK_REQUIRED" });
    expect(prismaMock.visionPack.create).not.toHaveBeenCalled();
    expect(renderScene).not.toHaveBeenCalled();
    expect(await servedRenderUrl()).toBe(CLEAN_URL);
  });
});
