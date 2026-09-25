import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { randomUUID } from "node:crypto";

const { prismaMock, deleteUser } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return {
    prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>(),
    deleteUser: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { deleteUser } } }),
}));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { GET } = await import("@/app/api/cron/cleanup-anon-users/route");
const { staleAnonProfilesWhere } = await import("@/server/services/anon-cleanup");

const ORIGINAL_ENV = { ...process.env };
const DAY = 24 * 60 * 60 * 1000;

function authorized() {
  return new Request("http://localhost/api/cron/cleanup-anon-users", {
    headers: { authorization: "Bearer shh" },
  });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: "shh" };
  deleteUser.mockReset();
  deleteUser.mockResolvedValue({ error: null });
  prismaMock.chatConversation.deleteMany.mockResolvedValue({ count: 0 } as never);
  prismaMock.rateLimitHit.deleteMany.mockResolvedValue({ count: 0 } as never);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  mockReset(prismaMock as unknown as DeepMockProxy<typeof prismaMock>);
});

describe("staleAnonProfilesWhere", () => {
  const cutoff = new Date("2026-09-11T03:00:00Z");

  it("selects anonymous profiles older than the window", () => {
    const where = staleAnonProfilesWhere(cutoff);
    expect(where.is_anonymous).toBe(true);
    expect(where.created_at).toEqual({ lt: cutoff });
  });

  it("spares a couple whose live family link was made or voted on inside the window", () => {
    // F6: the delete cascades through the design to the link and its votes,
    // so a link sent to family on day 12 must not die on day 15.
    expect(staleAnonProfilesWhere(cutoff).NOT).toEqual({
      venue_designs: {
        some: {
          shares: {
            some: {
              revoked_at: null,
              OR: [
                { created_at: { gte: cutoff } },
                { votes: { some: { updated_at: { gte: cutoff } } } },
              ],
            },
          },
        },
      },
    });
  });
});

describe("GET /api/cron/cleanup-anon-users", () => {
  it("rejects a caller without the cron secret", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const res = await GET(new Request("http://localhost/api/cron/cleanup-anon-users"));
    expect(res.status).toBe(401);
    expect(prismaMock.profile.findMany).not.toHaveBeenCalled();
  });

  it("asks the database for the stale profiles with a 14 day cutoff, and deletes each one", async () => {
    const stale = [{ id: randomUUID() }, { id: randomUUID() }];
    prismaMock.profile.findMany.mockResolvedValue(stale as never);

    const before = Date.now();
    const res = await GET(authorized());
    expect(await res.json()).toEqual({ ok: true, processed: 2, deleted: 2 });

    const args = prismaMock.profile.findMany.mock.calls[0][0]!;
    const cutoff = (args.where!.created_at as { lt: Date }).lt;
    // The live-link exemption is part of the query, so spared couples never
    // fill the batch and stall the sweep.
    expect(args.where).toEqual(staleAnonProfilesWhere(cutoff));
    expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(14 * DAY - 60_000);
    expect(before - cutoff.getTime()).toBeLessThanOrEqual(14 * DAY + 60_000);

    expect(deleteUser.mock.calls.map(([id]) => id)).toEqual(stale.map((s) => s.id));
  });
});

describe("the rate-limit counter sweep", () => {
  it("drops Postgres fallback counters older than two days, the longest window being one", async () => {
    prismaMock.profile.findMany.mockResolvedValue([]);
    const before = Date.now();
    await GET(authorized());
    const where = prismaMock.rateLimitHit.deleteMany.mock.calls[0]![0]!.where as {
      window_start: { lt: Date };
    };
    const cutoff = where.window_start.lt.getTime();
    expect(before - cutoff).toBeGreaterThanOrEqual(2 * DAY - 1000);
    expect(before - cutoff).toBeLessThanOrEqual(2 * DAY + 1000);
  });
});
