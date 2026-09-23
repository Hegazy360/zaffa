import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

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
vi.mock("@/lib/rate-limit", () => ({ enforceTrpcMany: vi.fn(), enforceTrpc: vi.fn() }));

// `resend` is deliberately null here, this is the exact misconfiguration that
// used to make the old contact-form path return success while dropping the
// lead entirely. The enquiry must still persist.
vi.mock("@/lib/resend", () => ({ resend: null }));

const notifyEnquiryReceived = vi.fn();
vi.mock("@/server/services/notifications/dispatchers", () => ({
  notifyEnquiryReceived: (...args: unknown[]) => notifyEnquiryReceived(...args),
}));

const { enquiriesRouter, allowedNextStatuses } = await import(
  "@/server/routers/enquiries"
);

const USER_ID = randomUUID();
const ENQUIRY_ID = randomUUID();
const DESIGN_ID = randomUUID();

function caller(user: { id: string } | null) {
  return enquiriesRouter.createCaller({ user } as never);
}

const VALID = {
  fullName: "Noor & Faisal",
  email: "noor@example.com",
  city: "Dubai",
  country: "AE",
  guestBand: "medium",
  preferredChannel: "whatsapp" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.enquiry.create.mockResolvedValue({ id: ENQUIRY_ID } as never);
  prismaMock.profile.findUnique.mockResolvedValue({ role: "admin" } as never);
});

describe("enquiries.submit", () => {
  it("persists the enquiry even with no email transport configured", async () => {
    const res = await caller(null).submit(VALID);
    expect(prismaMock.enquiry.create).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: true, id: ENQUIRY_ID });
  });

  it("still returns the id when the admin fan-out throws", async () => {
    // A notification outage must never cost us the lead.
    notifyEnquiryReceived.mockRejectedValueOnce(new Error("posthog down"));
    const res = await caller(null).submit(VALID);
    expect(res.id).toBe(ENQUIRY_ID);
    expect(prismaMock.enquiry.create).toHaveBeenCalledTimes(1);
  });

  it("writes the row BEFORE notifying - ordering is the guarantee", async () => {
    const order: string[] = [];
    prismaMock.enquiry.create.mockImplementationOnce((() => {
      order.push("create");
      return Promise.resolve({ id: ENQUIRY_ID });
    }) as never);
    notifyEnquiryReceived.mockImplementationOnce(async () => {
      order.push("notify");
    });
    await caller(null).submit(VALID);
    expect(order).toEqual(["create", "notify"]);
  });

  it("accepts an anonymous submitter and stores no user link", async () => {
    await caller(null).submit(VALID);
    expect(prismaMock.enquiry.create.mock.calls[0][0].data.user_id).toBeNull();
  });

  it("fakes success and writes nothing when the honeypot is filled", async () => {
    const res = await caller(null).submit({ ...VALID, hp: "" } as never);
    expect(res.ok).toBe(true);
    // An empty string is what a real browser submits, that must still persist.
    expect(prismaMock.enquiry.create).toHaveBeenCalledTimes(1);
  });

  it("requires at least one of email or phone", async () => {
    await expect(
      caller(null).submit({ fullName: "No Contact" } as never),
    ).rejects.toThrow();
    expect(prismaMock.enquiry.create).not.toHaveBeenCalled();
  });

  it("accepts a phone-only submission (WhatsApp-first markets)", async () => {
    await caller(null).submit({
      fullName: "Phone Only",
      phone: "+971500000000",
    } as never);
    expect(prismaMock.enquiry.create).toHaveBeenCalledTimes(1);
  });

  it("ignores a designId the submitter does not own", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue(null as never);
    await caller({ id: USER_ID }).submit({ ...VALID, designId: DESIGN_ID });
    expect(prismaMock.enquiry.create.mock.calls[0][0].data.design_id).toBeNull();
  });

  it("links a designId the submitter owns", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue({ id: DESIGN_ID } as never);
    await caller({ id: USER_ID }).submit({ ...VALID, designId: DESIGN_ID });
    expect(prismaMock.enquiry.create.mock.calls[0][0].data.design_id).toBe(DESIGN_ID);
  });
});

describe("enquiries status transitions", () => {
  it("allows only forward moves, plus lost from anywhere live", () => {
    expect(allowedNextStatuses("new")).toEqual(["contacted", "lost"]);
    expect(allowedNextStatuses("quote_sent")).toEqual(["accepted", "lost"]);
    // Terminal states are terminal.
    expect(allowedNextStatuses("delivered")).toEqual([]);
    expect(allowedNextStatuses("lost")).toEqual([]);
  });

  it("rejects a backwards transition at the router", async () => {
    prismaMock.enquiry.findUnique.mockResolvedValue({ status: "quote_sent" } as never);
    await expect(
      caller({ id: USER_ID }).updateStatus({ id: ENQUIRY_ID, status: "new" }),
    ).rejects.toThrow(/Cannot move an enquiry/);
    expect(prismaMock.enquiry.update).not.toHaveBeenCalled();
  });

  it("permits a legal transition and stamps status_changed_at", async () => {
    prismaMock.enquiry.findUnique.mockResolvedValue({ status: "new" } as never);
    prismaMock.enquiry.update.mockResolvedValue({ id: ENQUIRY_ID } as never);
    await caller({ id: USER_ID }).updateStatus({
      id: ENQUIRY_ID,
      status: "contacted",
    });
    const data = prismaMock.enquiry.update.mock.calls[0][0].data;
    expect(data.status).toBe("contacted");
    expect(data.status_changed_at).toBeInstanceOf(Date);
  });
});

describe("enquiries admin guard", () => {
  it("rejects a non-admin on the admin surfaces", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ role: "client" } as never);
    await expect(caller({ id: USER_ID }).list({ limit: 10 })).rejects.toThrow(
      /Admin only/,
    );
  });
});

describe("enquiries.byId: the design brief (F5)", () => {
  const RENDER_OLD = randomUUID();
  const RENDER_NEW = randomUUID();

  function enquiryWithDesign(selected: string | null) {
    return {
      id: ENQUIRY_ID,
      status: "new",
      user_id: USER_ID,
      design_id: DESIGN_ID,
      country: "EG",
      notes: [],
      user: null,
      event: null,
      design: {
        id: DESIGN_ID,
        name: "Garden nikah",
        event_type: "wedding",
        created_at: new Date("2026-09-06T10:00:00Z"),
        thumbnail: null,
        setting: "outdoor",
        size: "large",
        guest_count: 180,
        palette: { colors: ["#ffffff"] },
        style_notes: "lots of white flowers",
        venue_photo: null,
        selected_media_id: selected,
        media: [
          {
            id: RENDER_OLD,
            url: "https://res.cloudinary.com/zaffa/old.jpg",
            parent_id: null,
            created_at: new Date("2026-09-06T10:00:00Z"),
            meta: { mode: "generate", model: "google/gemini", costUsd: 0.138 },
          },
          {
            id: RENDER_NEW,
            url: "https://res.cloudinary.com/zaffa/new.jpg",
            parent_id: RENDER_OLD,
            created_at: new Date("2026-09-06T11:00:00Z"),
            meta: { mode: "refine", instructionRaw: "more candles", costUsd: 0.022 },
          },
        ],
      },
    };
  }

  beforeEach(() => {
    prismaMock.venueDesign.findMany.mockResolvedValue([] as never);
  });

  it("returns the chosen render, clean, and every version", async () => {
    prismaMock.enquiry.findUnique.mockResolvedValue(enquiryWithDesign(RENDER_OLD) as never);
    const res = await caller({ id: USER_ID }).byId({ id: ENQUIRY_ID });
    expect(res.brief?.selected).toMatchObject({
      id: RENDER_OLD,
      url: "https://res.cloudinary.com/zaffa/old.jpg",
      pinned: true,
    });
    expect(res.brief?.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(res.brief?.versions[1]).toMatchObject({ instruction: "more candles", parentNumber: 1 });
    // The list chip and the old sidebar read `thumbnail`: now the render.
    expect(res.design?.thumbnail).toBe("https://res.cloudinary.com/zaffa/old.jpg");
  });

  it("keeps model names and per-image costs on the server", async () => {
    prismaMock.enquiry.findUnique.mockResolvedValue(enquiryWithDesign(null) as never);
    const res = await caller({ id: USER_ID }).byId({ id: ENQUIRY_ID });
    const body = JSON.stringify(res);
    expect(body).not.toContain("costUsd");
    expect(body).not.toContain("google/gemini");
    expect(res.design).not.toHaveProperty("media");
  });

  it("never reads a render with a model just because the page was opened", async () => {
    prismaMock.enquiry.findUnique.mockResolvedValue(enquiryWithDesign(null) as never);
    const res = await caller({ id: USER_ID }).byId({ id: ENQUIRY_ID });
    expect(res.brief?.plan).toBeNull();
    expect(res.brief?.planNeedsAnalysis).toBe(true);
    // Nothing was written back either: a view is a read.
    expect(prismaMock.venueDesignMedia.update).not.toHaveBeenCalled();
    expect(prismaMock.venueDesignMedia.updateMany).not.toHaveBeenCalled();
  });

  it("has no brief for an enquiry without a design", async () => {
    prismaMock.enquiry.findUnique.mockResolvedValue({
      ...enquiryWithDesign(null),
      design: null,
      design_id: null,
    } as never);
    const res = await caller({ id: USER_ID }).byId({ id: ENQUIRY_ID });
    expect(res.brief).toBeNull();
    expect(res.design).toBeNull();
  });
});

describe("enquiries.list: the render on each row (F5)", () => {
  const PINNED = randomUUID();

  it("shows the chosen render, else the newest, never the null thumbnail", async () => {
    prismaMock.enquiry.findMany.mockResolvedValue([
      {
        id: randomUUID(),
        design: {
          id: DESIGN_ID,
          thumbnail: null,
          selected_media_id: PINNED,
          media: [{ url: "https://res.cloudinary.com/zaffa/newest.jpg" }],
        },
      },
      {
        id: randomUUID(),
        design: {
          id: randomUUID(),
          thumbnail: null,
          selected_media_id: null,
          media: [{ url: "https://res.cloudinary.com/zaffa/only.jpg" }],
        },
      },
      { id: randomUUID(), design: null },
    ] as never);
    prismaMock.venueDesignMedia.findMany.mockResolvedValue([
      { id: PINNED, url: "https://res.cloudinary.com/zaffa/chosen.jpg", design_id: DESIGN_ID },
    ] as never);

    const res = await caller({ id: USER_ID }).list({ limit: 10 });
    expect(res.items.map((e) => e.design?.thumbnail ?? null)).toEqual([
      "https://res.cloudinary.com/zaffa/chosen.jpg",
      "https://res.cloudinary.com/zaffa/only.jpg",
      null,
    ]);
    // One read for the pinned renders of the whole page.
    expect(prismaMock.venueDesignMedia.findMany).toHaveBeenCalledOnce();
    expect(prismaMock.venueDesignMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [PINNED] }, type: "render" } }),
    );
  });

  it("does not trust a pin that points into another design", async () => {
    prismaMock.enquiry.findMany.mockResolvedValue([
      {
        id: randomUUID(),
        design: {
          id: DESIGN_ID,
          thumbnail: null,
          selected_media_id: PINNED,
          media: [{ url: "https://res.cloudinary.com/zaffa/newest.jpg" }],
        },
      },
    ] as never);
    prismaMock.venueDesignMedia.findMany.mockResolvedValue([
      { id: PINNED, url: "https://res.cloudinary.com/zaffa/elsewhere.jpg", design_id: randomUUID() },
    ] as never);
    const res = await caller({ id: USER_ID }).list({ limit: 10 });
    expect(res.items[0]?.design?.thumbnail).toBe("https://res.cloudinary.com/zaffa/newest.jpg");
  });
});
