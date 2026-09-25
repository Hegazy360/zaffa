import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { randomUUID } from "node:crypto";

const { prismaMock, sendEmailMock, reportErrorMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return {
    prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>(),
    sendEmailMock: vi.fn(),
    reportErrorMock: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/services/notifications/email", () => ({
  sendNotificationEmail: sendEmailMock,
}));
vi.mock("@/lib/logger", () => ({
  reportError: reportErrorMock,
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { notifyMany } = await import("@/server/services/notifications/notify");

const ADMIN_A = randomUUID();
const ADMIN_B = randomUUID();
const ADMIN_UNSUBSCRIBED = randomUUID();
const ENQUIRY_ID = randomUUID();

function createdRows() {
  const args = prismaMock.notification.createMany.mock.calls[0]?.[0] as {
    data: Array<{ id: string; user_id: string }>;
  };
  return args.data;
}

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(true);
  reportErrorMock.mockReset();
  prismaMock.profile.findMany.mockResolvedValue([
    { id: ADMIN_A, locale: "en", email_unsubscribed_at: null },
    { id: ADMIN_B, locale: "ar", email_unsubscribed_at: null },
    { id: ADMIN_UNSUBSCRIBED, locale: "en", email_unsubscribed_at: new Date() },
  ] as never);
  prismaMock.notification.createMany.mockResolvedValue({ count: 3 } as never);
  prismaMock.notification.updateMany.mockResolvedValue({ count: 2 } as never);
  prismaMock.$queryRaw.mockResolvedValue([
    { id: ADMIN_A, email: "a@zaffa.test" },
    { id: ADMIN_B, email: "b@zaffa.test" },
  ] as never);
});

afterEach(() => {
  mockReset(prismaMock as unknown as DeepMockProxy<typeof prismaMock>);
});

const ARGS = {
  userIds: [ADMIN_A, ADMIN_B, ADMIN_UNSUBSCRIBED],
  type: "design_approved" as const,
  link: `/dashboard/admin/enquiries/${ENQUIRY_ID}`,
  varsFor: () => ({ coupleName: "Couple A", designName: "Garden" }),
  data: { enquiryId: ENQUIRY_ID },
};

describe("notifyMany stamps emailed_at like notify does", () => {
  it("writes every in-app row with an id it can find again", async () => {
    await notifyMany(ARGS);
    const rows = createdRows();
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });

  it("stamps exactly the rows whose email went out", async () => {
    await notifyMany(ARGS);
    const rows = createdRows();
    const idFor = (userId: string) => rows.find((r) => r.user_id === userId)!.id;
    expect(prismaMock.notification.updateMany).toHaveBeenCalledOnce();
    const call = prismaMock.notification.updateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
      data: { emailed_at: Date };
    };
    // The unsubscribed admin gets the bell but no email, so no stamp.
    expect(call.where.id.in.sort()).toEqual([idFor(ADMIN_A), idFor(ADMIN_B)].sort());
    expect(call.data.emailed_at).toBeInstanceOf(Date);
  });

  it("leaves a row unstamped when its email was rejected", async () => {
    sendEmailMock.mockImplementation(async (a: { to: string }) => a.to === "a@zaffa.test");
    await notifyMany(ARGS);
    const rows = createdRows();
    const call = prismaMock.notification.updateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
    };
    expect(call.where.id.in).toEqual([rows.find((r) => r.user_id === ADMIN_A)!.id]);
  });

  it("does not write at all when no email went out", async () => {
    sendEmailMock.mockResolvedValue(false);
    await notifyMany(ARGS);
    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled();
  });

  it("reports, never throws, when the stamp itself fails", async () => {
    prismaMock.notification.updateMany.mockRejectedValue(new Error("db blip"));
    await expect(notifyMany(ARGS)).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalledWith(
      "notifications.notifyMany.stamp_failed",
      expect.any(Error),
      expect.objectContaining({ type: "design_approved", count: 2 }),
    );
  });
});
