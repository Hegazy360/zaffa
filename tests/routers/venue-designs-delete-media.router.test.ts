import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// venueDesigns.deleteMedia with talked changes (F2). A change is a render
// row whose parent_id is the version it was made from, and the schema sets
// that to NULL when the parent is deleted. Deleting a version hands its
// changes to its own parent instead, so a chain keeps its lineage (and a
// dressed venue its photo and slider). Videos stay under their render.

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/posthog", () => ({ captureServer: vi.fn(), trackServer: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({
  cloudinary: {},
  watermarkedUrl: vi.fn((id: string) => `wm:${id}`),
}));
vi.mock("@/server/services/notifications/dispatchers", () => ({
  notifyDesignApproved: vi.fn(),
}));

const { venueDesignsRouter } = await import("@/server/routers/venue-designs");

const USER_ID = randomUUID();
const DESIGN_ID = randomUUID();
const ROOT_ID = randomUUID();
const CHANGE_ID = randomUUID();

function caller(userId = USER_ID) {
  return venueDesignsRouter.createCaller({
    user: { id: userId, email: null, is_anonymous: false },
  } as never);
}

function media(overrides: { type?: string; parent_id?: string | null; userId?: string } = {}) {
  return {
    id: CHANGE_ID,
    design_id: DESIGN_ID,
    type: overrides.type ?? "render",
    parent_id: overrides.parent_id === undefined ? ROOT_ID : overrides.parent_id,
    design: { user_id: overrides.userId ?? USER_ID },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.venueDesignMedia.updateMany.mockReturnValue("reparent" as never);
  prismaMock.venueDesignMedia.delete.mockReturnValue("delete" as never);
  prismaMock.$transaction.mockResolvedValue([{ count: 1 }, { id: CHANGE_ID }] as never);
});

describe("venueDesigns.deleteMedia", () => {
  it("hands a deleted change's own changes to its parent, in one transaction", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(media() as never);
    const res = await caller().deleteMedia({ id: CHANGE_ID });
    expect(prismaMock.venueDesignMedia.updateMany).toHaveBeenCalledWith({
      where: { parent_id: CHANGE_ID, design_id: DESIGN_ID, type: "render" },
      data: { parent_id: ROOT_ID },
    });
    expect(prismaMock.venueDesignMedia.delete).toHaveBeenCalledWith({
      where: { id: CHANGE_ID },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(["reparent", "delete"]);
    expect(res).toEqual({ id: CHANGE_ID });
  });

  it("makes a deleted root's changes roots, as the schema would", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      media({ parent_id: null }) as never,
    );
    await caller().deleteMedia({ id: CHANGE_ID });
    expect(prismaMock.venueDesignMedia.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { parent_id: null } }),
    );
  });

  it("deletes a video on its own, moving nothing", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      media({ type: "video" }) as never,
    );
    prismaMock.venueDesignMedia.delete.mockResolvedValue({ id: CHANGE_ID } as never);
    await caller().deleteMedia({ id: CHANGE_ID });
    expect(prismaMock.venueDesignMedia.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.venueDesignMedia.delete).toHaveBeenCalledWith({
      where: { id: CHANGE_ID },
    });
  });

  it("touches nothing of someone else's", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(
      media({ userId: randomUUID() }) as never,
    );
    await expect(caller().deleteMedia({ id: CHANGE_ID })).rejects.toThrow(
      "Media not found",
    );
    expect(prismaMock.venueDesignMedia.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.venueDesignMedia.delete).not.toHaveBeenCalled();
  });
});
