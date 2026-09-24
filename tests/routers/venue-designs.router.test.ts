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
  // Approval and lead are one transaction; the callback runs against the
  // same mock, so assertions on prismaMock see the writes made inside it.
  prismaMock.$transaction.mockImplementation((async (fn: unknown) =>
    (fn as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock)) as never);
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
    expect(res).toEqual({
      ok: true,
      alreadyApproved: false,
      enquiryId: ENQUIRY_ID,
      detailsAdded: false,
    });
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
    expect(res).toEqual({
      ok: true,
      alreadyApproved: true,
      enquiryId: ENQUIRY_ID,
      detailsAdded: false,
    });
    expect(prismaMock.enquiry.create).not.toHaveBeenCalled();
    expect(notifyDesignApproved).not.toHaveBeenCalled();
  });

  it("files the approval and its lead in one transaction", async () => {
    await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.enquiry.create).toHaveBeenCalledOnce();
  });

  it("a lead lost to a failed create is filed by the retry, not reported as filed", async () => {
    // A small stand-in for the database: the approval flag, the leads, and
    // a transaction that puts both back when its callback throws.
    let approvedAt: Date | null = null;
    let leads: string[] = [];
    prismaMock.$transaction.mockImplementation((async (fn: unknown) => {
      const before = { approvedAt, leads: [...leads] };
      try {
        return await (fn as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock);
      } catch (err) {
        approvedAt = before.approvedAt;
        leads = before.leads;
        throw err;
      }
    }) as never);
    prismaMock.venueDesign.updateMany.mockImplementation((async (args: {
      where: { approved_at?: null };
      data: { approved_at?: Date };
    }) => {
      if ("approved_at" in args.where && approvedAt) return { count: 0 };
      if (args.data.approved_at) approvedAt = args.data.approved_at;
      return { count: 1 };
    }) as never);
    prismaMock.venueDesign.findFirst.mockResolvedValue({ id: DESIGN_ID } as never);
    prismaMock.enquiry.findFirst.mockImplementation((async () =>
      leads.length ? { id: leads[0] } : null) as never);
    prismaMock.enquiry.create
      .mockRejectedValueOnce(new Error("pool timeout"))
      .mockImplementation((async () => {
        leads.push(ENQUIRY_ID);
        return { id: ENQUIRY_ID };
      }) as never);

    await expect(caller(COUPLE).approve({ designId: DESIGN_ID })).rejects.toThrow();
    // The failed create took the approval back with it.
    expect(approvedAt).toBeNull();
    expect(notifyDesignApproved).not.toHaveBeenCalled();

    const retry = await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(retry).toEqual({
      ok: true,
      alreadyApproved: false,
      enquiryId: ENQUIRY_ID,
      detailsAdded: false,
    });
    expect(leads).toEqual([ENQUIRY_ID]);
    expect(notifyDesignApproved).toHaveBeenCalledOnce();

    // And the click after that is the idempotent one.
    const third = await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(third).toMatchObject({ alreadyApproved: true, enquiryId: ENQUIRY_ID });
    expect(leads).toEqual([ENQUIRY_ID]);
    expect(notifyDesignApproved).toHaveBeenCalledOnce();
  });

  it("files the lead for a design approved without one, instead of saying the team has it", async () => {
    // approved_at set, no design_approved enquiry: the state an approval
    // whose create failed before the transaction existed was left in.
    prismaMock.venueDesign.updateMany
      .mockResolvedValueOnce({ count: 0 } as never) // the conditional flip
      .mockResolvedValue({ count: 1 } as never); // the re-stamp
    prismaMock.venueDesign.findFirst.mockResolvedValue({ id: DESIGN_ID } as never);
    prismaMock.enquiry.findFirst.mockResolvedValue(null as never);

    const res = await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(res).toEqual({
      ok: true,
      alreadyApproved: false,
      enquiryId: ENQUIRY_ID,
      detailsAdded: false,
    });
    expect(prismaMock.enquiry.create).toHaveBeenCalledOnce();
    expect(notifyDesignApproved).toHaveBeenCalledOnce();
    // The re-stamp is scoped to the caller's design and runs before the
    // second look, so a twin recovering the same design waits on the row.
    expect(prismaMock.venueDesign.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: DESIGN_ID, user_id: USER_ID },
      data: { approved_at: expect.any(Date) },
    });
    expect(prismaMock.enquiry.findFirst).toHaveBeenCalledTimes(2);
  });

  it("a twin that waited on the re-stamp hands back the lead the other one filed", async () => {
    prismaMock.venueDesign.updateMany
      .mockResolvedValueOnce({ count: 0 } as never)
      .mockResolvedValue({ count: 1 } as never);
    prismaMock.venueDesign.findFirst.mockResolvedValue({ id: DESIGN_ID } as never);
    prismaMock.enquiry.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: ENQUIRY_ID } as never);

    const res = await caller(COUPLE).approve({ designId: DESIGN_ID });
    expect(res).toMatchObject({ alreadyApproved: true, enquiryId: ENQUIRY_ID });
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
        where: {
          id: MEDIA_ID,
          design_id: DESIGN_ID,
          type: "render",
          // Only a render of the caller's own design can be pinned.
          design: { user_id: USER_ID },
        },
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

describe("venueDesigns.approve with the couple's details (F5)", () => {
  const DETAILS = {
    phone: "+20 101 234 5678",
    eventDate: "2026-10",
    city: "Cairo",
    country: "eg",
  };

  function createdData() {
    const call = prismaMock.enquiry.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    return call.data;
  }

  it("files the lead with the number, the month and the place", async () => {
    await caller(COUPLE).approve({ designId: DESIGN_ID, ...DETAILS });
    const data = createdData();
    expect(data).toMatchObject({
      phone: "+201012345678",
      preferred_channel: "whatsapp",
      city: "Cairo",
      country: "EG",
      // A month is stored as its first day and marked flexible, not as a
      // wedding on the 1st.
      date_flexible: true,
    });
    expect((data.event_date as Date).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("stores an exact day as a fixed date", async () => {
    await caller(COUPLE).approve({ designId: DESIGN_ID, eventDate: "2027-04-17" });
    const data = createdData();
    expect(data.date_flexible).toBe(false);
    expect((data.event_date as Date).toISOString()).toBe("2027-04-17T00:00:00.000Z");
  });

  it("prefers the number typed in the dialog over the profile's", async () => {
    await caller(COUPLE).approve({ designId: DESIGN_ID, phone: "00971 50 111 2222" });
    expect(createdData().phone).toBe("+971501112222");
  });

  it("reaches for email when there is no number anywhere", async () => {
    // A Google sign-in: no phone on the profile, none typed.
    prismaMock.profile.findUnique.mockResolvedValue({
      full_name: "Couple A",
      phone: null,
      locale: "ar",
    } as never);
    await caller(COUPLE).approve({ designId: DESIGN_ID, phone: "", city: "" });
    const data = createdData();
    expect(data.phone).toBeNull();
    expect(data.preferred_channel).toBe("email");
    expect(data.city).toBeNull();
  });

  it("keeps the number on the profile only when the profile has none", async () => {
    await caller(COUPLE).approve({ designId: DESIGN_ID, phone: "+201012345678" });
    expect(prismaMock.profile.updateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, OR: [{ phone: null }, { phone: "" }] },
      data: { phone: "+201012345678" },
    });
  });

  it("still files the lead when saving the number on the profile fails", async () => {
    prismaMock.profile.updateMany.mockRejectedValueOnce(new Error("db blip"));
    const res = await caller(COUPLE).approve({ designId: DESIGN_ID, phone: "+201012345678" });
    expect(res.enquiryId).toBe(ENQUIRY_ID);
    expect(notifyDesignApproved).toHaveBeenCalledOnce();
  });

  it("rejects a phone that is not a number before writing anything", async () => {
    await expect(
      caller(COUPLE).approve({ designId: DESIGN_ID, phone: "call my mum" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prismaMock.venueDesign.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.enquiry.create).not.toHaveBeenCalled();
  });

  it("rejects an impossible date before writing anything", async () => {
    await expect(
      caller(COUPLE).approve({ designId: DESIGN_ID, eventDate: "2026-02-30" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prismaMock.venueDesign.updateMany).not.toHaveBeenCalled();
  });

  describe("when the design is already approved", () => {
    beforeEach(() => {
      prismaMock.venueDesign.updateMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.venueDesign.findFirst.mockResolvedValue({ id: DESIGN_ID } as never);
      prismaMock.enquiry.findFirst.mockResolvedValue({ id: ENQUIRY_ID } as never);
      prismaMock.enquiry.updateMany.mockResolvedValue({ count: 1 } as never);
    });

    it("fills the existing lead's empty fields instead of ignoring them", async () => {
      const res = await caller(COUPLE).approve({ designId: DESIGN_ID, ...DETAILS });
      expect(res).toEqual({
        ok: true,
        alreadyApproved: true,
        enquiryId: ENQUIRY_ID,
        detailsAdded: true,
      });
      // Still one lead and one notification, ever.
      expect(prismaMock.enquiry.create).not.toHaveBeenCalled();
      expect(notifyDesignApproved).not.toHaveBeenCalled();

      const writes = prismaMock.enquiry.updateMany.mock.calls.map((c) => c[0]);
      expect(writes).toEqual(
        expect.arrayContaining([
          {
            where: { id: ENQUIRY_ID, OR: [{ phone: null }, { phone: "" }] },
            data: { phone: "+201012345678", preferred_channel: "whatsapp" },
          },
          {
            where: { id: ENQUIRY_ID, event_date: null },
            data: { event_date: new Date("2026-10-01T00:00:00.000Z"), date_flexible: true },
          },
          {
            where: { id: ENQUIRY_ID, OR: [{ city: null }, { city: "" }] },
            data: { city: "Cairo" },
          },
          { where: { id: ENQUIRY_ID, country: null }, data: { country: "EG" } },
        ]),
      );
    });

    it("never overwrites: every write is matched only while the field is empty", async () => {
      // The lead already has all four; the conditional writes match nothing.
      prismaMock.enquiry.updateMany.mockResolvedValue({ count: 0 } as never);
      const res = await caller(COUPLE).approve({ designId: DESIGN_ID, ...DETAILS });
      expect(res.detailsAdded).toBe(false);
      for (const [args] of prismaMock.enquiry.updateMany.mock.calls) {
        const where = (args as { where: Record<string, unknown> }).where;
        const guarded =
          "OR" in where || where.event_date === null || where.country === null;
        expect(guarded).toBe(true);
      }
      expect(prismaMock.enquiry.update).not.toHaveBeenCalled();
    });

    it("writes nothing to the lead when no details came with the re-click", async () => {
      const res = await caller(COUPLE).approve({ designId: DESIGN_ID });
      expect(res.detailsAdded).toBe(false);
      expect(prismaMock.enquiry.updateMany).not.toHaveBeenCalled();
    });

    it("re-pins the version on screen", async () => {
      const MEDIA_ID = randomUUID();
      prismaMock.venueDesignMedia.findFirst.mockResolvedValue({ id: MEDIA_ID } as never);
      await caller(COUPLE).approve({ designId: DESIGN_ID, mediaId: MEDIA_ID });
      expect(prismaMock.venueDesign.updateMany).toHaveBeenLastCalledWith({
        where: { id: DESIGN_ID, user_id: USER_ID },
        data: { selected_media_id: MEDIA_ID },
      });
    });

    it("tells a design the caller does not own from an approved one", async () => {
      prismaMock.venueDesign.findFirst.mockResolvedValue(null as never);
      await expect(
        caller(COUPLE).approve({ designId: DESIGN_ID, ...DETAILS }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(prismaMock.enquiry.updateMany).not.toHaveBeenCalled();
    });
  });
});
