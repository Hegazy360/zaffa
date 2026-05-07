import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { randomUUID } from "node:crypto";

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return {
    prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/posthog", () => ({
  trackServer: vi.fn(),
  captureServer: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: vi.fn() } } }),
}));
vi.mock("@/server/services/notifications/dispatchers", () => ({
  notifyEventInServiceArea: vi.fn(),
}));

const { requireActivePack, consumeQuota } = await import(
  "@/server/routers/vision-packs"
);

const USER_ID = randomUUID();
const PACK_ID = randomUUID();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-06T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  mockReset(prismaMock as unknown as DeepMockProxy<typeof prismaMock>);
});

describe("requireActivePack (paywall guard)", () => {
  function buildPack(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: PACK_ID,
      recipient_user_id: USER_ID,
      status: "active" as const,
      paid_at: new Date("2026-05-06T08:00:00.000Z"),
      expires_at: new Date("2026-07-05T08:00:00.000Z"), // ~60 days out
      renders_quota: 20,
      renders_used: 5,
      videos_quota: 2,
      videos_used: 0,
      ...overrides,
    };
  }

  it("throws PACK_REQUIRED when the user has no active pack", async () => {
    prismaMock.visionPack.findFirst.mockResolvedValue(null);
    await expect(requireActivePack(USER_ID, "render")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "PACK_REQUIRED",
    });
  });

  it("throws PACK_WINDOW_EXPIRED and flips status when expires_at is past", async () => {
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({ expires_at: new Date("2026-04-01T00:00:00.000Z") }) as never,
    );
    prismaMock.visionPack.update.mockResolvedValue({} as never);

    await expect(requireActivePack(USER_ID, "render")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "PACK_WINDOW_EXPIRED",
    });
    expect(prismaMock.visionPack.update).toHaveBeenCalledWith({
      where: { id: PACK_ID },
      data: { status: "expired" },
    });
  });

  it("throws PACK_QUOTA_RENDERS when render quota is exhausted", async () => {
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({ renders_used: 20, renders_quota: 20 }) as never,
    );
    await expect(requireActivePack(USER_ID, "render")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "PACK_QUOTA_RENDERS",
    });
  });

  it("throws PACK_QUOTA_VIDEOS when video quota is exhausted", async () => {
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({ videos_used: 2, videos_quota: 2 }) as never,
    );
    await expect(requireActivePack(USER_ID, "video")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "PACK_QUOTA_VIDEOS",
    });
  });

  it("returns the pack when active, in-window, and has quota remaining", async () => {
    const pack = buildPack();
    prismaMock.visionPack.findFirst.mockResolvedValue(pack as never);
    const out = await requireActivePack(USER_ID, "render");
    expect(out.id).toBe(PACK_ID);
    expect(prismaMock.visionPack.update).not.toHaveBeenCalled();
  });
});

describe("consumeQuota (atomic decrement + fulfilled flip)", () => {
  it("increments renders_used in a transaction", async () => {
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      const cb = fn as (tx: typeof prismaMock) => Promise<unknown>;
      prismaMock.visionPack.update.mockResolvedValueOnce({
        renders_used: 6,
        renders_quota: 20,
        videos_used: 0,
        videos_quota: 2,
        status: "active",
      } as never);
      return cb(prismaMock);
    });

    await consumeQuota(PACK_ID, "render");
    expect(prismaMock.visionPack.update).toHaveBeenCalledWith({
      where: { id: PACK_ID },
      data: { renders_used: { increment: 1 } },
      select: expect.any(Object),
    });
  });

  it("flips status to fulfilled when both quotas hit zero", async () => {
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      const cb = fn as (tx: typeof prismaMock) => Promise<unknown>;
      // First call: increment → returns row with both quotas exhausted.
      prismaMock.visionPack.update.mockResolvedValueOnce({
        renders_used: 20,
        renders_quota: 20,
        videos_used: 2,
        videos_quota: 2,
        status: "active",
      } as never);
      // Second call: status update to "fulfilled".
      prismaMock.visionPack.update.mockResolvedValueOnce({} as never);
      return cb(prismaMock);
    });

    await consumeQuota(PACK_ID, "video");

    expect(prismaMock.visionPack.update).toHaveBeenNthCalledWith(2, {
      where: { id: PACK_ID },
      data: { status: "fulfilled" },
    });
  });

  it("does NOT flip to fulfilled when one quota still has room", async () => {
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      const cb = fn as (tx: typeof prismaMock) => Promise<unknown>;
      prismaMock.visionPack.update.mockResolvedValueOnce({
        renders_used: 20,
        renders_quota: 20,
        videos_used: 0, // videos still available
        videos_quota: 2,
        status: "active",
      } as never);
      return cb(prismaMock);
    });

    await consumeQuota(PACK_ID, "render");
    expect(prismaMock.visionPack.update).toHaveBeenCalledTimes(1);
  });
});
