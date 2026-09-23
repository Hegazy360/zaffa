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
vi.mock("@/lib/cloudinary", () => ({
  cloudinary: {},
  watermarkedUrl: vi.fn((id: string) => `wm:${id}`),
}));

const notifyDesignApproved = vi.fn();
vi.mock("@/server/services/notifications/dispatchers", () => ({
  notifyDesignApproved: (...args: unknown[]) => notifyDesignApproved(...args),
}));

const { venueDesignsRouter } = await import("@/server/routers/venue-designs");

const USER_ID = randomUUID();
const DESIGN_ID = randomUUID();
const ENQUIRY_ID = randomUUID();

function caller(user: { id: string; email?: string; is_anonymous?: boolean } | null) {
  return venueDesignsRouter.createCaller({ user } as never);
}

const COUPLE = { id: USER_ID, email: "noor@example.com", is_anonymous: false };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.venueDesign.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.venueDesign.findUniqueOrThrow.mockResolvedValue({
    name: "Garden Nikah",
    guest_count: 150,
  } as never);
  prismaMock.profile.findUnique.mockResolvedValue({
    full_name: "Noor & Faisal",
    phone: "+971500000000",
    locale: "ar",
  } as never);
  prismaMock.enquiry.create.mockResolvedValue({ id: ENQUIRY_ID } as never);
});

describe("venueDesigns.approve", () => {
  it("approves without any pack - the tier gate is gone", async () => {
    // The account that surfaced PACK_TIER_NO_PLANNER_MATCH had only an
    // expired free-taste pack. No visionPack query may run in this path.
    const res = await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(res).toEqual({ ok: true, alreadyApproved: false, enquiryId: ENQUIRY_ID });
    expect(prismaMock.visionPack.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("creates the lead with source design_approved and the design attached", async () => {
    await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(prismaMock.enquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "design_approved",
          design_id: DESIGN_ID,
          user_id: USER_ID,
          full_name: "Noor & Faisal",
          preferred_channel: "whatsapp",
        }),
      }),
    );
  });

  it("writes the row BEFORE notifying - ordering is the guarantee", async () => {
    const order: string[] = [];
    prismaMock.enquiry.create.mockImplementationOnce((() => {
      order.push("create");
      return Promise.resolve({ id: ENQUIRY_ID });
    }) as never);
    notifyDesignApproved.mockImplementationOnce(async () => {
      order.push("notify");
    });
    await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(order).toEqual(["create", "notify"]);
  });

  it("still returns the lead when the admin fan-out throws", async () => {
    notifyDesignApproved.mockRejectedValueOnce(new Error("resend down"));
    const res = await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(res.enquiryId).toBe(ENQUIRY_ID);
  });

  it("re-click is idempotent: no second enquiry, no second notification", async () => {
    // The conditional updateMany is the guard: count 0 means someone (this
    // click's twin) already flipped approved_at.
    prismaMock.venueDesign.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.venueDesign.findFirst.mockResolvedValue({ id: DESIGN_ID } as never);
    prismaMock.enquiry.findFirst.mockResolvedValue({ id: ENQUIRY_ID } as never);

    const res = await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(res).toEqual({ ok: true, alreadyApproved: true, enquiryId: ENQUIRY_ID });
    expect(prismaMock.enquiry.create).not.toHaveBeenCalled();
    expect(notifyDesignApproved).not.toHaveBeenCalled();
  });

  it("rejects a design the caller does not own", async () => {
    // updateMany scoped by user_id misses, and the ownership probe misses too
    // - someone else's designId must read as NOT_FOUND, not as approved.
    prismaMock.venueDesign.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.venueDesign.findFirst.mockResolvedValue(null as never);
    await expect(
      caller(COUPLE).approve({ designId: DESIGN_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prismaMock.enquiry.create).not.toHaveBeenCalled();
  });

  it("rejects anonymous users - contact details are the point", async () => {
    await expect(
      caller({ id: USER_ID, is_anonymous: true }).approve({ designId: DESIGN_ID }),
    ).rejects.toMatchObject({ message: "ANONYMOUS_NOT_ALLOWED" });
    expect(prismaMock.venueDesign.updateMany).not.toHaveBeenCalled();
  });

  it("pins the version the couple asked about as the selected render", async () => {
    const MEDIA_ID = randomUUID();
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue({ id: MEDIA_ID } as never);
    await caller(COUPLE).approve({ designId: DESIGN_ID, mediaId: MEDIA_ID });
    expect(prismaMock.venueDesignMedia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEDIA_ID, design_id: DESIGN_ID, type: "render" },
      }),
    );
    expect(prismaMock.venueDesign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: DESIGN_ID, user_id: USER_ID }),
        data: expect.objectContaining({ selected_media_id: MEDIA_ID }),
      }),
    );
  });

  it("refuses to pin a render from another design, before approving anything", async () => {
    prismaMock.venueDesignMedia.findFirst.mockResolvedValue(null as never);
    await expect(
      caller(COUPLE).approve({ designId: DESIGN_ID, mediaId: randomUUID() }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "MEDIA_NOT_IN_DESIGN" });
    expect(prismaMock.venueDesign.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.enquiry.create).not.toHaveBeenCalled();
  });

  it("leaves the selected render alone when no version is named", async () => {
    await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(prismaMock.venueDesignMedia.findFirst).not.toHaveBeenCalled();
    const call = prismaMock.venueDesign.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).not.toHaveProperty("selected_media_id");
  });

  it("falls back to the email local part when the profile has no name", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      full_name: null,
      phone: null,
      locale: null,
    } as never);
    await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(prismaMock.enquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ full_name: "noor" }),
      }),
    );
  });
});
