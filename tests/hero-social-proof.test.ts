import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The homepage's "{count}+ weddings designed on Zaffa" must count weddings,
// not images. A talked change (F2) is saved as a render row like any
// other, so counting render rows let one couple's changes add to the
// public number; it counts wedding designs with a render instead.

const prisma = {
  venueDesign: { count: vi.fn(), findMany: vi.fn() },
  venueDesignMedia: { count: vi.fn() },
  visionPack: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ reportError: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: { count?: number }) =>
    values?.count !== undefined ? `${key}:${values.count}` : key,
}));

const { HeroSocialProof } = await import("@/components/home/hero-social-proof");

async function markup(): Promise<string> {
  return renderToStaticMarkup(await HeroSocialProof());
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.visionPack.findMany.mockResolvedValue([]);
  prisma.venueDesign.findMany.mockResolvedValue([]);
});

describe("HeroSocialProof", () => {
  it("counts wedding designs that have a render, never render rows", async () => {
    prisma.venueDesign.count.mockResolvedValue(260);
    expect(await markup()).toContain("heroSocialProof:250");
    expect(prisma.venueDesign.count).toHaveBeenCalledWith({
      where: { event_type: "wedding", media: { some: { type: "render" } } },
    });
    expect(prisma.venueDesignMedia.count).not.toHaveBeenCalled();
  });

  it("stays silent below the floor", async () => {
    prisma.venueDesign.count.mockResolvedValue(249);
    expect(await markup()).not.toContain("heroSocialProof");
  });
});
