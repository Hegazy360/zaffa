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

const {
  requireActivePack,
  ensureFreePack,
  consumeQuota,
  reserveEdit,
  releaseEdit,
  activatePackFromCheckout,
} = await import("@/server/routers/vision-packs");

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
      edits_quota: 60,
      edits_used: 0,
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

  it("throws PACK_WINDOW_EXPIRED and closes an untouched pack as expired", async () => {
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({
        renders_used: 0,
        expires_at: new Date("2026-04-01T00:00:00.000Z"),
      }) as never,
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

  it("closes a used pack as fulfilled when its window passes, so it keeps its microsite", async () => {
    // Partly used paid pack: 5 of 20 renders.
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
      data: { status: "fulfilled" },
    });
  });

  it("closes a spent paid pack held open by unused edits as fulfilled, not expired", async () => {
    // 20/20 renders and 2/2 videos used to be `fulfilled` on the spot.
    // With 0/60 edits it stays active to the end of its window, and the
    // window closing must not take its microsite and lookbook away.
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({
        renders_used: 20,
        videos_used: 2,
        edits_used: 0,
        expires_at: new Date("2026-04-01T00:00:00.000Z"),
      }) as never,
    );
    prismaMock.visionPack.update.mockResolvedValue({} as never);

    await expect(requireActivePack(USER_ID, "video")).rejects.toMatchObject({
      message: "PACK_WINDOW_EXPIRED",
    });
    expect(prismaMock.visionPack.update).toHaveBeenCalledWith({
      where: { id: PACK_ID },
      data: { status: "fulfilled" },
    });
  });

  it("answers a used free taste past its window with PACK_REQUIRED and closes it as fulfilled", async () => {
    // Not "your generation window has closed, your renders are on your
    // microsite": the couple never bought anything.
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({
        sku: "wedding_free_taste_v1",
        renders_used: 1,
        renders_quota: 1,
        videos_quota: 0,
        edits_quota: 3,
        expires_at: new Date("2026-04-01T00:00:00.000Z"),
      }) as never,
    );
    prismaMock.visionPack.update.mockResolvedValue({} as never);

    await expect(requireActivePack(USER_ID, "render")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "PACK_REQUIRED",
    });
    expect(prismaMock.visionPack.update).toHaveBeenCalledWith({
      where: { id: PACK_ID },
      data: { status: "fulfilled" },
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

  it("throws PACK_QUOTA_EDITS when the edit quota is exhausted", async () => {
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({ edits_used: 60, edits_quota: 60 }) as never,
    );
    await expect(requireActivePack(USER_ID, "edit")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "PACK_QUOTA_EDITS",
    });
  });

  it("lets an edit through while edits remain, even with renders spent", async () => {
    // The free taste after its one render: the whole point of edits is
    // that the couple can still say "warmer" to the render they have.
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({
        sku: "wedding_free_taste_v1",
        renders_used: 1,
        renders_quota: 1,
        videos_quota: 0,
        edits_used: 2,
        edits_quota: 3,
      }) as never,
    );
    const out = await requireActivePack(USER_ID, "edit");
    expect(out.id).toBe(PACK_ID);
  });

  it("does not let an edit through on renders or videos left over", async () => {
    // Guards against the edit branch reading the wrong counter.
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({ renders_used: 0, videos_used: 0, edits_used: 3, edits_quota: 3 }) as never,
    );
    await expect(requireActivePack(USER_ID, "edit")).rejects.toMatchObject({
      message: "PACK_QUOTA_EDITS",
    });
  });

  it("answers a spent free render with PACK_REQUIRED, not 'you used your pack'", async () => {
    // A free pack now stays active while its edits last, so its second
    // render reaches the renders check instead of finding no active pack.
    // It must still open the "Unlock generation" paywall it always did.
    prismaMock.visionPack.findFirst.mockResolvedValue(
      buildPack({
        sku: "wedding_free_taste_v1",
        renders_used: 1,
        renders_quota: 1,
        videos_quota: 0,
        edits_quota: 3,
      }) as never,
    );
    await expect(requireActivePack(USER_ID, "render")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "PACK_REQUIRED",
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

  it("flips status to fulfilled when every quota hits zero", async () => {
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      const cb = fn as (tx: typeof prismaMock) => Promise<unknown>;
      // First call: increment → returns row with every quota exhausted
      // (edits included since F2, see isPackExhausted).
      prismaMock.visionPack.update.mockResolvedValueOnce({
        renders_used: 20,
        renders_quota: 20,
        videos_used: 2,
        videos_quota: 2,
        edits_used: 60,
        edits_quota: 60,
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

describe("consumeQuota and edits (the fulfilled flip)", () => {
  function runTxReturning(row: Record<string, unknown>) {
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      const cb = fn as (tx: typeof prismaMock) => Promise<unknown>;
      prismaMock.visionPack.update.mockResolvedValueOnce(row as never);
      prismaMock.visionPack.update.mockResolvedValueOnce({} as never);
      return cb(prismaMock);
    });
  }

  it("keeps a free pack active when its render is spent but edits are left", async () => {
    runTxReturning({
      renders_used: 1,
      renders_quota: 1,
      videos_used: 0,
      videos_quota: 0,
      edits_used: 0,
      edits_quota: 3,
      status: "active",
    });
    await consumeQuota(PACK_ID, "render");
    expect(prismaMock.visionPack.update).toHaveBeenCalledTimes(1);
  });

  it("flips to fulfilled when the last render lands with edits already spent", async () => {
    runTxReturning({
      renders_used: 1,
      renders_quota: 1,
      videos_used: 0,
      videos_quota: 0,
      edits_used: 3,
      edits_quota: 3,
      status: "active",
    });
    await consumeQuota(PACK_ID, "render");
    expect(prismaMock.visionPack.update).toHaveBeenNthCalledWith(2, {
      where: { id: PACK_ID },
      data: { status: "fulfilled" },
    });
  });

  it("reads the edit counters back from the increment", async () => {
    runTxReturning({
      renders_used: 2,
      renders_quota: 20,
      videos_used: 0,
      videos_quota: 2,
      edits_used: 0,
      edits_quota: 60,
      status: "active",
    });
    await consumeQuota(PACK_ID, "render");
    expect(prismaMock.visionPack.update).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ edits_used: true, edits_quota: true }),
      }),
    );
  });
});

/**
 * The Postgres text (`$1` placeholders) of a Prisma.sql template, with
 * whitespace collapsed so assertions read like the statement.
 */
function sqlOf(arg: unknown): { text: string; values: unknown[] } {
  const q = arg as { text: string; values: unknown[] };
  return { text: q.text.replace(/\s+/g, " ").trim(), values: q.values };
}

describe("reserveEdit (atomic reserve-before-spend)", () => {
  it("returns true when the conditional UPDATE hands a row back", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: PACK_ID }] as never);
    await expect(reserveEdit(PACK_ID)).resolves.toBe(true);
  });

  it("returns false when no row matched (no edits left, or pack not active)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([] as never);
    await expect(reserveEdit(PACK_ID)).resolves.toBe(false);
  });

  it("guards the increment on status and on edits_used < edits_quota in one statement", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: PACK_ID }] as never);
    await reserveEdit(PACK_ID);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    const { text, values } = sqlOf(prismaMock.$queryRaw.mock.calls[0][0]);
    expect(text).toMatch(/^UPDATE vision_packs SET edits_used = edits_used \+ 1/);
    // The guard IS the gate: without it N parallel refinements all pass.
    expect(text).toContain("AND edits_used < edits_quota");
    expect(text).toContain(`AND status = 'active'::"VisionPackStatus"`);
    expect(text).toMatch(/WHERE id = \$1::uuid/);
    expect(text).toMatch(/RETURNING id$/);
    // Parameterised, never interpolated.
    expect(values).toEqual([PACK_ID]);
    expect(text).not.toContain(PACK_ID);
  });

  it("flips to fulfilled in the same statement when this edit was the last unit", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: PACK_ID }] as never);
    await reserveEdit(PACK_ID);
    const { text } = sqlOf(prismaMock.$queryRaw.mock.calls[0][0]);
    expect(text).toContain(
      "WHEN renders_used >= renders_quota AND videos_used >= videos_quota AND edits_used + 1 >= edits_quota THEN 'fulfilled'",
    );
    expect(text).toContain("ELSE status");
  });

  it("does not touch the pack through the Prisma client (no read-then-write race)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: PACK_ID }] as never);
    await reserveEdit(PACK_ID);
    expect(prismaMock.visionPack.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.visionPack.update).not.toHaveBeenCalled();
  });
});

describe("releaseEdit (give a reserved edit back)", () => {
  it("decrements with a floor at zero and reopens a pack the reserve fulfilled", async () => {
    prismaMock.$executeRaw.mockResolvedValue(1 as never);
    await releaseEdit(PACK_ID);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    const { text, values } = sqlOf(prismaMock.$executeRaw.mock.calls[0][0]);
    expect(text).toContain("SET edits_used = GREATEST(edits_used - 1, 0)");
    expect(text).toContain(
      `WHEN status = 'fulfilled'::"VisionPackStatus" AND edits_used > 0 AND (expires_at IS NULL OR expires_at > now()) THEN 'active'::"VisionPackStatus"`,
    );
    expect(text).toMatch(/WHERE id = \$1::uuid$/);
    expect(values).toEqual([PACK_ID]);
  });
});

describe("ensureFreePack (one taste per person)", () => {
  function pack(overrides: Record<string, unknown> = {}) {
    return {
      id: PACK_ID,
      recipient_user_id: USER_ID,
      sku: "wedding_free_taste_v1",
      status: "active",
      renders_used: 0,
      renders_quota: 1,
      videos_used: 0,
      videos_quota: 0,
      edits_used: 0,
      edits_quota: 3,
      ...overrides,
    };
  }

  it("returns the pack the user already holds without creating one", async () => {
    prismaMock.visionPack.findFirst.mockResolvedValueOnce(pack() as never);
    await expect(ensureFreePack(USER_ID)).resolves.toMatchObject({ id: PACK_ID });
    expect(prismaMock.visionPack.create).not.toHaveBeenCalled();
  });

  it("grants a first-time visitor a free taste with its three edits", async () => {
    prismaMock.visionPack.findFirst.mockResolvedValue(null);
    prismaMock.visionPack.create.mockResolvedValue(pack() as never);
    await ensureFreePack(USER_ID);
    expect(prismaMock.visionPack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sku: "wedding_free_taste_v1",
        status: "active",
        renders_quota: 1,
        videos_quota: 0,
        edits_quota: 3,
      }),
    });
  });

  it("grants nothing to someone whose earlier pack produced a render, whatever its status", async () => {
    // No active or fulfilled pack (an older build expired it), but it made
    // something. Minting another would be a free render on us, and a
    // watermark on anything a paid pack of theirs produced.
    prismaMock.visionPack.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: PACK_ID } as never);
    await expect(ensureFreePack(USER_ID)).resolves.toBeNull();
    expect(prismaMock.visionPack.create).not.toHaveBeenCalled();
    expect(prismaMock.visionPack.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        recipient_user_id: USER_ID,
        OR: [
          { renders_used: { gt: 0 } },
          { videos_used: { gt: 0 } },
          { edits_used: { gt: 0 } },
        ],
      },
      select: { id: true },
    });
  });
});

describe("activatePackFromCheckout (edit allowance on activation)", () => {
  function pendingPack(overrides: Record<string, unknown> = {}) {
    return {
      id: PACK_ID,
      status: "pending_payment",
      buyer_user_id: USER_ID,
      recipient_user_id: USER_ID,
      is_gift: false,
      microsite_slug: null,
      sku: "wedding_design_pack_v1",
      edits_quota: 60,
      ...overrides,
    };
  }

  it("tops up a row a pre-edits build stamped with 0 edits", async () => {
    prismaMock.visionPack.findUnique
      .mockResolvedValueOnce(pendingPack({ edits_quota: 0 }) as never)
      .mockResolvedValue(null as never);
    prismaMock.visionPack.update.mockResolvedValue({} as never);
    await activatePackFromCheckout({ packId: PACK_ID, paymentIntentId: "pi_1" });
    expect(prismaMock.visionPack.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "active", edits_quota: 60 }),
      }),
    );
  });

  it("leaves a correctly stamped row's edits alone", async () => {
    prismaMock.visionPack.findUnique
      .mockResolvedValueOnce(pendingPack() as never)
      .mockResolvedValue(null as never);
    prismaMock.visionPack.update.mockResolvedValue({} as never);
    await activatePackFromCheckout({ packId: PACK_ID, paymentIntentId: "pi_1" });
    const data = prismaMock.visionPack.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data).not.toHaveProperty("edits_quota");
  });
});
