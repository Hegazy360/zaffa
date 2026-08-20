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
