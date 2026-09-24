import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const trackServer = vi.fn();
vi.mock("@/lib/posthog", () => ({
  captureServer: vi.fn(),
  trackServer: (...args: unknown[]) => trackServer(...args),
}));

const enforceTrpc = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock("@/lib/rate-limit", () => ({
  enforceTrpc: (...args: unknown[]) => enforceTrpc(...args),
  ipFromRequest: (req: Request) =>
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
}));

vi.mock("@/lib/cloudinary", () => ({
  cloudinary: {},
  watermarkedUrl: (id: string) => `https://res.cloudinary.com/demo/wm/${id}.jpg`,
}));

const { designSharesRouter } = await import("@/server/routers/design-shares");

const OWNER_ID = randomUUID();
const STRANGER_ID = randomUUID();
const DESIGN_ID = randomUUID();
const SHARE_ID = randomUUID();
const OLDER_SHARE_ID = randomUUID();
const TOKEN = "Zk3v9Q_hT2m-8xYcLp0aBw";
const R1 = randomUUID();
const R2 = randomUUID();
const R3 = randomUUID();
const VOTER = randomUUID();

type User = { id: string; is_anonymous?: boolean; email?: string | null };

function caller(user: User | null, headers: Record<string, string> = {}) {
  return designSharesRouter.createCaller({
    user: user ? { email: null, is_anonymous: false, ...user } : null,
    req: new Request("https://zaffa.ai/api/trpc", { headers }),
  } as never);
}

const OWNER: User = { id: OWNER_ID };

/** The design's renders as the DB holds them, deliberately not in order. */
function renderRows() {
  return [
    {
      id: R2,
      url: "https://res.cloudinary.com/demo/image/upload/v1/zaffa-renders/r2.png",
      cloudinary_public_id: "zaffa-renders/r2",
      meta: {
        mode: "refine",
        model: "openai/gpt-image-2.5-flare",
        costUsd: 0.022,
        instructionRaw: "ورد أكتر على الكوشة",
        instructionEn: "Add more flowers to the stage",
        confirmation: "تمام، زودنا الورد",
      },
      created_at: new Date("2026-09-21T11:00:00Z"),
    },
    {
      id: R1,
      url: "https://res.cloudinary.com/demo/image/upload/v1/zaffa-renders/r1.png",
      cloudinary_public_id: "zaffa-renders/r1",
      meta: {
        mode: "dress_venue",
        model: "openai/gpt-image-2.5-sunburst",
        costUsd: 0.057,
        venuePublicId: `zaffa-venues/${OWNER_ID}/hall`,
      },
      created_at: new Date("2026-09-21T10:00:00Z"),
    },
    {
      // Legacy, provider-hosted: nothing to derive a watermark from.
      id: R3,
      url: "https://provider.example/legacy.png",
      cloudinary_public_id: null,
      meta: null,
      created_at: new Date("2026-09-21T12:00:00Z"),
    },
  ];
}

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    revoked_at: null,
    design: {
      name: "Garden Nikah",
      user_id: OWNER_ID,
      user: { full_name: "Noor Hassan" },
      media: [...renderRows()].sort((a, b) => a.created_at.getTime() - b.created_at.getTime()),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  enforceTrpc.mockResolvedValue(undefined);
  prismaMock.venueDesign.findFirst.mockResolvedValue({ id: DESIGN_ID } as never);
  prismaMock.venueDesignMedia.count.mockResolvedValue(2 as never);
  prismaMock.designShare.findFirst.mockResolvedValue(null);
  prismaMock.designShare.create.mockImplementation((async (args: {
    data: { token: string };
  }) => ({ token: args.data.token })) as never);
  prismaMock.profile.findUnique.mockResolvedValue({ free_render_email: null } as never);
  prismaMock.visionPack.count.mockResolvedValue(0 as never);
});

describe("designShares.create", () => {
  it("is refused while the kill switch is off, before any read", async () => {
    vi.stubEnv("FLAG_FAMILY_SHARE", "0");
    await expect(caller(OWNER).create({ designId: DESIGN_ID })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "FAMILY_SHARE_DISABLED",
    });
    expect(prismaMock.venueDesign.findFirst).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    await expect(caller(null).create({ designId: DESIGN_ID })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("answers NOT_FOUND for someone else's design, and never creates a link", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue(null);
    await expect(
      caller({ id: STRANGER_ID }).create({ designId: DESIGN_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prismaMock.venueDesign.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DESIGN_ID, user_id: STRANGER_ID } }),
    );
    expect(prismaMock.designShare.create).not.toHaveBeenCalled();
  });

  it("refuses an anonymous couple who has not passed the email gate", async () => {
    await expect(
      caller({ id: OWNER_ID, is_anonymous: true }).create({ designId: DESIGN_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "EMAIL_REQUIRED" });
    expect(prismaMock.designShare.create).not.toHaveBeenCalled();
  });

  it("lets an anonymous couple share once they gave their email", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      free_render_email: "noor@example.com",
    } as never);
    const res = await caller({ id: OWNER_ID, is_anonymous: true }).create({
      designId: DESIGN_ID,
    });
    expect(res.created).toBe(true);
  });

  it("refuses a design with no render yet", async () => {
    prismaMock.venueDesignMedia.count.mockResolvedValue(0 as never);
    await expect(caller(OWNER).create({ designId: DESIGN_ID })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "NO_RENDERS",
    });
    expect(prismaMock.venueDesignMedia.count).toHaveBeenCalledWith({
      where: { design_id: DESIGN_ID, type: "render" },
    });
  });

  it("hands back the live link instead of minting a second one", async () => {
    prismaMock.designShare.findFirst.mockResolvedValue({ token: TOKEN } as never);
    const res = await caller(OWNER).create({ designId: DESIGN_ID });
    expect(res).toEqual({ token: TOKEN, path: `/s/${TOKEN}`, created: false });
    expect(prismaMock.designShare.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { design_id: DESIGN_ID, revoked_at: null } }),
    );
    expect(prismaMock.designShare.create).not.toHaveBeenCalled();
    // Re-reading a link is free; only minting spends the bucket.
    expect(enforceTrpc).not.toHaveBeenCalled();
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("mints an unguessable token: 16 random bytes, base64url", async () => {
    const a = await caller(OWNER).create({ designId: DESIGN_ID });
    const b = await caller(OWNER).create({ designId: DESIGN_ID });
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(a.token, "base64url")).toHaveLength(16);
    expect(a.token).not.toBe(b.token);
    expect(a.path).toBe(`/s/${a.token}`);
    expect(prismaMock.designShare.create).toHaveBeenCalledWith({
      data: { design_id: DESIGN_ID, token: a.token },
      select: { token: true },
    });
  });

  it("is limited per couple and tracked once per new link", async () => {
    await caller(OWNER).create({ designId: DESIGN_ID });
    expect(enforceTrpc).toHaveBeenCalledWith("shareCreate", OWNER_ID, "SHARE_RATE_LIMITED");
    expect(trackServer).toHaveBeenCalledWith(OWNER_ID, "design.shared", {
      design_id: DESIGN_ID,
      renders: 2,
    });
  });

  it("stops at the limiter before writing anything", async () => {
    enforceTrpc.mockRejectedValue(
      Object.assign(new Error("SHARE_RATE_LIMITED"), { code: "TOO_MANY_REQUESTS" }),
    );
    await expect(caller(OWNER).create({ designId: DESIGN_ID })).rejects.toThrow();
    expect(prismaMock.designShare.create).not.toHaveBeenCalled();
  });
});

describe("designShares.revoke", () => {
  it("kills every live link of the owner's design", async () => {
    prismaMock.designShare.updateMany.mockResolvedValue({ count: 2 } as never);
    const res = await caller(OWNER).revoke({ designId: DESIGN_ID });
    expect(res).toEqual({ revoked: 2 });
    const args = prismaMock.designShare.updateMany.mock.calls[0][0] as unknown as {
      where: unknown;
      data: { revoked_at: Date };
    };
    expect(args.where).toEqual({ design_id: DESIGN_ID, revoked_at: null });
    expect(args.data.revoked_at).toBeInstanceOf(Date);
  });

  it("cannot touch someone else's links", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue(null);
    await expect(
      caller({ id: STRANGER_ID }).revoke({ designId: DESIGN_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prismaMock.designShare.updateMany).not.toHaveBeenCalled();
  });

  it("still works with the kill switch off, so a leaked link can always be closed", async () => {
    vi.stubEnv("FLAG_FAMILY_SHARE", "0");
    prismaMock.designShare.updateMany.mockResolvedValue({ count: 1 } as never);
    await expect(caller(OWNER).revoke({ designId: DESIGN_ID })).resolves.toEqual({ revoked: 1 });
  });
});

describe("designShares.forOwner", () => {
  beforeEach(() => {
    prismaMock.designShare.findMany.mockResolvedValue([
      { id: SHARE_ID, token: TOKEN, created_at: new Date("2026-09-22T09:00:00Z") },
      { id: OLDER_SHARE_ID, token: "older_token_abcdefgh12", created_at: new Date("2026-09-22T08:59:59Z") },
    ] as never);
    prismaMock.venueDesignMedia.findMany.mockResolvedValue(
      renderRows().map(({ id, created_at }) => ({ id, created_at })) as never,
    );
    prismaMock.designVote.findMany.mockResolvedValue([
      { media_id: R2, voter_name: "Mona", comment: "The flowers!", updated_at: new Date("2026-09-22T12:00:00Z") },
      { media_id: R1, voter_name: "Aunt Hala", comment: null, updated_at: new Date("2026-09-22T11:00:00Z") },
      { media_id: R2, voter_name: "Karim", comment: null, updated_at: new Date("2026-09-22T10:00:00Z") },
      // A vote for a render that is no longer this design's.
      { media_id: randomUUID(), voter_name: "Ghost", comment: null, updated_at: new Date() },
    ] as never);
  });

  it("answers NOT_FOUND to anyone but the owner", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue(null);
    await expect(
      caller({ id: STRANGER_ID }).forOwner({ designId: DESIGN_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prismaMock.designShare.findMany).not.toHaveBeenCalled();
  });

  it("says so, and reads no link, while an anonymous couple is still behind the email gate", async () => {
    const res = await caller({ id: OWNER_ID, is_anonymous: true }).forOwner({
      designId: DESIGN_ID,
    });
    expect(res).toEqual({ needsEmail: true, share: null, votes: [], voterCount: 0 });
    expect(prismaMock.designShare.findMany).not.toHaveBeenCalled();
  });

  it("returns no link when the design was never shared", async () => {
    prismaMock.designShare.findMany.mockResolvedValue([]);
    const res = await caller(OWNER).forOwner({ designId: DESIGN_ID });
    expect(res).toEqual({ needsEmail: false, share: null, votes: [], voterCount: 0 });
    expect(prismaMock.designVote.findMany).not.toHaveBeenCalled();
  });

  it("tallies votes per version across every live link, most loved first", async () => {
    const res = await caller(OWNER).forOwner({ designId: DESIGN_ID });
    expect(res.share).toMatchObject({ token: TOKEN, path: `/s/${TOKEN}` });
    expect(prismaMock.designShare.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { design_id: DESIGN_ID, revoked_at: null } }),
    );
    expect(prismaMock.designVote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { share_id: { in: [SHARE_ID, OLDER_SHARE_ID] } } }),
    );
    expect(res.votes).toEqual([
      {
        mediaId: R2,
        // R1 was made first, so R2 is version 2 and the legacy R3 is 3.
        number: 2,
        count: 2,
        voters: [
          { name: "Mona", comment: "The flowers!", at: new Date("2026-09-22T12:00:00Z") },
          { name: "Karim", comment: null, at: new Date("2026-09-22T10:00:00Z") },
        ],
      },
      {
        mediaId: R1,
        number: 1,
        count: 1,
        voters: [{ name: "Aunt Hala", comment: null, at: new Date("2026-09-22T11:00:00Z") }],
      },
    ]);
    expect(res.voterCount).toBe(3);
  });

  it("is refused while the kill switch is off", async () => {
    vi.stubEnv("FLAG_FAMILY_SHARE", "0");
    await expect(caller(OWNER).forOwner({ designId: DESIGN_ID })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("designShares.getByToken (public)", () => {
  beforeEach(() => {
    prismaMock.designShare.findUnique.mockResolvedValue(shareRow() as never);
  });

  it("is open to visitors with no session at all", async () => {
    const res = await caller(null).getByToken({ token: TOKEN });
    expect(res.versions.length).toBeGreaterThan(0);
  });

  it("serves a free couple's renders watermarked only, oldest first, dropping what cannot be watermarked", async () => {
    const res = await caller(null).getByToken({ token: TOKEN });
    expect(res.versions).toEqual([
      {
        id: R1,
        number: 1,
        url: "https://res.cloudinary.com/demo/wm/zaffa-renders/r1.jpg",
        caption: null,
      },
      {
        id: R2,
        number: 2,
        url: "https://res.cloudinary.com/demo/wm/zaffa-renders/r2.jpg",
        // The couple's own words, never the English prompt.
        caption: "ورد أكتر على الكوشة",
      },
    ]);
  });

  it("counts only paid packs as a reason to serve clean renders", async () => {
    await caller(null).getByToken({ token: TOKEN });
    expect(prismaMock.visionPack.count).toHaveBeenCalledWith({
      where: {
        recipient_user_id: OWNER_ID,
        status: { in: ["active", "fulfilled"] },
        sku: { not: "wedding_free_taste_v1" },
      },
    });
  });

  it("serves a paying couple's renders clean", async () => {
    prismaMock.visionPack.count.mockResolvedValue(1 as never);
    const res = await caller(null).getByToken({ token: TOKEN });
    expect(res.versions.map((v) => v.url)).toEqual([
      "https://res.cloudinary.com/demo/image/upload/v1/zaffa-renders/r1.png",
      "https://res.cloudinary.com/demo/image/upload/v1/zaffa-renders/r2.png",
      "https://provider.example/legacy.png",
    ]);
    expect(res.versions.map((v) => v.number)).toEqual([1, 2, 3]);
  });

  it("leaks nothing beyond the first name, the design name and the versions", async () => {
    const res = await caller(null).getByToken({ token: TOKEN });
    expect(Object.keys(res).sort()).toEqual(["coupleName", "designName", "versions"]);
    for (const v of res.versions) {
      expect(Object.keys(v).sort()).toEqual(["caption", "id", "number", "url"]);
    }
    expect(res.coupleName).toBe("Noor");
    expect(res.designName).toBe("Garden Nikah");
    const wire = JSON.stringify(res);
    for (const secret of [
      "costUsd",
      "0.057",
      "gpt-image",
      "Add more flowers",
      "zaffa-venues",
      "cloudinary_public_id",
      "Hassan",
      OWNER_ID,
    ]) {
      expect(wire).not.toContain(secret);
    }
    // And never even reads the private columns.
    const select = (prismaMock.designShare.findUnique.mock.calls[0][0] as unknown as {
      select: { design: { select: Record<string, unknown> } };
    }).select.design.select;
    for (const col of ["venue_photo", "style_notes", "references", "palette"]) {
      expect(select).not.toHaveProperty(col);
    }
  });

  it("hides an email address used as a name, and the placeholder design name", async () => {
    prismaMock.designShare.findUnique.mockResolvedValue(
      shareRow({
        design: {
          ...shareRow().design,
          name: "Untitled Design",
          user: { full_name: "noor@example.com" },
        },
      }) as never,
    );
    const res = await caller(null).getByToken({ token: TOKEN });
    expect(res.coupleName).toBeNull();
    expect(res.designName).toBeNull();
  });

  it("answers NOT_FOUND for a revoked link", async () => {
    prismaMock.designShare.findUnique.mockResolvedValue(
      shareRow({ revoked_at: new Date() }) as never,
    );
    await expect(caller(null).getByToken({ token: TOKEN })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("answers NOT_FOUND for an unknown link", async () => {
    prismaMock.designShare.findUnique.mockResolvedValue(null);
    await expect(caller(null).getByToken({ token: TOKEN })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("answers NOT_FOUND for a malformed token without reading anything", async () => {
    await expect(
      caller(null).getByToken({ token: "../../etc/passwd" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prismaMock.designShare.findUnique).not.toHaveBeenCalled();
  });

  it("is dark while the kill switch is off", async () => {
    vi.stubEnv("FLAG_FAMILY_SHARE", "0");
    await expect(caller(null).getByToken({ token: TOKEN })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(prismaMock.designShare.findUnique).not.toHaveBeenCalled();
  });
});

describe("designShares.vote (public)", () => {
  const vote = (overrides: Record<string, unknown> = {}) => ({
    token: TOKEN,
    mediaId: R2,
    voterKey: VOTER,
    voterName: "  Mona  ",
    comment: "The flowers!",
    ...overrides,
  });

  beforeEach(() => {
    prismaMock.designShare.findUnique.mockResolvedValue({
      id: SHARE_ID,
      revoked_at: null,
      design_id: DESIGN_ID,
      design: { user_id: OWNER_ID },
    } as never);
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue({ id: R2 } as never);
    prismaMock.designVote.findUnique.mockResolvedValue(null);
    prismaMock.designVote.upsert.mockResolvedValue({} as never);
  });

  it("is limited per IP before any read", async () => {
    enforceTrpc.mockRejectedValue(
      Object.assign(new Error("VOTE_RATE_LIMITED"), { code: "TOO_MANY_REQUESTS" }),
    );
    await expect(
      caller(null, { "x-forwarded-for": "41.33.1.9, 10.0.0.1" }).vote(vote()),
    ).rejects.toThrow();
    expect(enforceTrpc).toHaveBeenCalledWith("shareVote", "41.33.1.9", "VOTE_RATE_LIMITED");
    expect(prismaMock.designShare.findUnique).not.toHaveBeenCalled();
  });

  it("records one vote per voter per link, upserted on their key", async () => {
    const res = await caller(null).vote(vote());
    expect(res).toEqual({ ok: true, mediaId: R2 });
    expect(prismaMock.designVote.upsert).toHaveBeenCalledWith({
      where: { share_id_voter_key: { share_id: SHARE_ID, voter_key: VOTER } },
      create: {
        share_id: SHARE_ID,
        voter_key: VOTER,
        media_id: R2,
        voter_name: "Mona",
        comment: "The flowers!",
      },
      update: { media_id: R2, voter_name: "Mona", comment: "The flowers!" },
    });
    expect(trackServer).toHaveBeenCalledWith(OWNER_ID, "design.vote_cast", {
      design_id: DESIGN_ID,
      first_vote: true,
      changed_mind: false,
      has_comment: true,
    });
  });

  it("changing your mind moves the vote and clears a note left on the old one", async () => {
    prismaMock.designVote.findUnique.mockResolvedValue({ media_id: R1 } as never);
    await caller(null).vote(vote({ comment: undefined }));
    const args = prismaMock.designVote.upsert.mock.calls[0][0] as unknown as {
      update: Record<string, unknown>;
    };
    expect(args.update).toEqual({ media_id: R2, voter_name: "Mona", comment: null });
    expect(trackServer).toHaveBeenCalledWith(
      OWNER_ID,
      "design.vote_cast",
      expect.objectContaining({ first_vote: false, changed_mind: true, has_comment: false }),
    );
  });

  it("stores an all-blank note as no note", async () => {
    await caller(null).vote(vote({ comment: "   " }));
    const args = prismaMock.designVote.upsert.mock.calls[0][0] as unknown as {
      create: Record<string, unknown>;
    };
    expect(args.create.comment).toBeNull();
  });

  it("only accepts a render of the shared design", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(null);
    await expect(caller(null).vote(vote())).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "MEDIA_NOT_IN_DESIGN",
    });
    expect(prismaMock.venueDesignMedia.findFirst).toHaveBeenCalledWith({
      where: { id: R2, design_id: DESIGN_ID, type: "render" },
      select: { id: true },
    });
    expect(prismaMock.designVote.upsert).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND on a revoked or unknown link", async () => {
    prismaMock.designShare.findUnique.mockResolvedValueOnce({
      id: SHARE_ID,
      revoked_at: new Date(),
      design_id: DESIGN_ID,
      design: { user_id: OWNER_ID },
    } as never);
    await expect(caller(null).vote(vote())).rejects.toMatchObject({ code: "NOT_FOUND" });
    prismaMock.designShare.findUnique.mockResolvedValueOnce(null);
    await expect(caller(null).vote(vote())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prismaMock.designVote.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty name", { voterName: "   " }],
    ["a name over 40 characters", { voterName: "x".repeat(41) }],
    ["a note over 280 characters", { comment: "x".repeat(281) }],
    ["a voter key that is not a uuid", { voterKey: "me" }],
    ["a media id that is not a uuid", { mediaId: "r2" }],
    ["a malformed token", { token: "short" }],
  ])("rejects %s", async (_label, overrides) => {
    await expect(caller(null).vote(vote(overrides))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(prismaMock.designVote.upsert).not.toHaveBeenCalled();
  });

  it("is dark while the kill switch is off", async () => {
    vi.stubEnv("FLAG_FAMILY_SHARE", "0");
    await expect(caller(null).vote(vote())).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(enforceTrpc).not.toHaveBeenCalled();
  });
});
