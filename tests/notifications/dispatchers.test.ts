import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { randomUUID } from "node:crypto";

const { prismaMock, sendEmailMock, reportErrorMock } = await vi.hoisted(
  async () => {
    const { mockDeep } = await import("vitest-mock-extended");
    return {
      prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>(),
      sendEmailMock: vi.fn(),
      reportErrorMock: vi.fn(),
    };
  }
);

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/services/notifications/email", () => ({
  sendNotificationEmail: sendEmailMock,
}));
vi.mock("@/lib/logger", () => ({
  reportError: reportErrorMock,
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const {
  notifyProposalReceived,
  notifyPaymentPaid,
  notifyPaymentDisputed,
  notifyPayoutReceived,
  notifyMessageReceived,
} = await import("@/server/services/notifications/dispatchers");

const CLIENT_USER_ID = randomUUID();
const PLANNER_USER_ID = randomUUID();
const EVENT_ID = randomUUID();
const PROPOSAL_ID = randomUUID();

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(true);
  reportErrorMock.mockReset();
  prismaMock.notification.create.mockResolvedValue({
    id: randomUUID(),
  } as never);
  prismaMock.notification.update.mockResolvedValue({} as never);
});

afterEach(() => {
  mockReset(prismaMock as unknown as DeepMockProxy<typeof prismaMock>);
});

describe("notify dispatchers: in-app row + email side-effects", () => {
  it("notifyProposalReceived persists English copy and emails subscribed users", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: CLIENT_USER_ID,
      locale: "en",
      email_unsubscribed_at: null,
    } as never);
    prismaMock.$queryRaw.mockResolvedValue([
      { email: "client@example.test" },
    ] as never);

    await notifyProposalReceived({
      clientUserId: CLIENT_USER_ID,
      plannerName: "Cairo Atelier",
      eventId: EVENT_ID,
      eventTitle: "October Wedding",
      proposalId: PROPOSAL_ID,
    });

    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: CLIENT_USER_ID,
          type: "proposal_received",
          link: `/dashboard/client/event/${EVENT_ID}?tab=proposals`,
        }),
      })
    );
    const created = prismaMock.notification.create.mock.calls[0][0]
      .data as unknown as Record<string, string>;
    expect(created.title).toContain("Cairo Atelier");
    expect(created.body).toContain("October Wedding");

    // Email side-effect waits on a microtask chain; flush it.
    await new Promise<void>((r) => setImmediate(r));
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.test",
        locale: "en",
      })
    );
  });

  it("renders Arabic copy when the recipient's locale is 'ar'", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: CLIENT_USER_ID,
      locale: "ar",
      email_unsubscribed_at: null,
    } as never);
    prismaMock.$queryRaw.mockResolvedValue([
      { email: "client@example.test" },
    ] as never);

    await notifyProposalReceived({
      clientUserId: CLIENT_USER_ID,
      plannerName: "أتيليه القاهرة",
      eventId: EVENT_ID,
      eventTitle: "زفاف أكتوبر",
      proposalId: PROPOSAL_ID,
    });

    const created = prismaMock.notification.create.mock.calls[0][0]
      .data as unknown as Record<string, string>;
    expect(created.title).toContain("أتيليه القاهرة");
  });

  it("skips email entirely for unsubscribed users (in-app row still written)", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: CLIENT_USER_ID,
      locale: "en",
      email_unsubscribed_at: new Date("2024-01-01"),
    } as never);

    await notifyPaymentPaid({
      clientUserId: CLIENT_USER_ID,
      eventId: EVENT_ID,
      eventTitle: "October Wedding",
      amount: "EGP 1,000",
      paymentId: randomUUID(),
    });

    expect(prismaMock.notification.create).toHaveBeenCalled();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("no-ops when the recipient profile is missing (no email lookup, no row)", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    await notifyPaymentDisputed({
      plannerUserId: PLANNER_USER_ID,
      eventId: EVENT_ID,
      eventTitle: "October Wedding",
      amount: "EGP 5,000",
      paymentId: randomUUID(),
    });

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("links payouts to the role-appropriate dashboard", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: PLANNER_USER_ID,
      locale: "en",
      email_unsubscribed_at: null,
    } as never);
    prismaMock.$queryRaw.mockResolvedValue([] as never);

    await notifyPayoutReceived({
      recipientUserId: PLANNER_USER_ID,
      role: "planner",
      amount: "EGP 1,000",
      method: "instapay",
      reference: "ref-1",
      payoutId: randomUUID(),
    });

    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          link: "/dashboard/planner/earnings",
        }),
      })
    );

    prismaMock.notification.create.mockClear();
    await notifyPayoutReceived({
      recipientUserId: PLANNER_USER_ID,
      role: "vendor",
      amount: "EGP 1,000",
      method: "instapay",
      payoutId: randomUUID(),
    });
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          link: "/dashboard/vendor/earnings",
        }),
      })
    );
  });

  it("notifyMessageReceived deep-links into the right role's event thread", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: CLIENT_USER_ID,
      locale: "en",
      email_unsubscribed_at: null,
    } as never);
    prismaMock.$queryRaw.mockResolvedValue([] as never);

    await notifyMessageReceived({
      recipientUserId: CLIENT_USER_ID,
      senderName: "Cairo Atelier",
      preview: "Hello!",
      eventId: EVENT_ID,
      recipientRole: "client",
      messageId: randomUUID(),
    });

    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          link: `/dashboard/client/event/${EVENT_ID}?tab=messages`,
        }),
      })
    );
  });

  it("swallows DB errors without throwing (parent mutation must succeed)", async () => {
    prismaMock.profile.findUnique.mockRejectedValue(new Error("DB down"));

    await expect(
      notifyPaymentPaid({
        clientUserId: CLIENT_USER_ID,
        eventId: EVENT_ID,
        eventTitle: "October Wedding",
        amount: "EGP 1,000",
        paymentId: randomUUID(),
      })
    ).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalled();
  });
});
