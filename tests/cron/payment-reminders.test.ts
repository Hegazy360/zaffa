import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { randomUUID } from "node:crypto";

const {
  prismaMock,
  notifyPaymentDueMock,
  notifyPaymentOverdueMock,
  staleDigestMock,
} = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return {
    prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>(),
    notifyPaymentDueMock: vi.fn(),
    notifyPaymentOverdueMock: vi.fn(),
    staleDigestMock: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/services/notifications/dispatchers", () => ({
  notifyPaymentDue: notifyPaymentDueMock,
  notifyPaymentOverdue: notifyPaymentOverdueMock,
}));
vi.mock("@/server/services/stale-leads", () => ({
  sendStaleLeadDigest: staleDigestMock,
}));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { GET } = await import("@/app/api/cron/payment-reminders/route");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  notifyPaymentDueMock.mockReset();
  notifyPaymentOverdueMock.mockReset();
  notifyPaymentDueMock.mockResolvedValue(undefined);
  notifyPaymentOverdueMock.mockResolvedValue(undefined);
  staleDigestMock.mockReset();
  staleDigestMock.mockResolvedValue({ stale: 0, emailed: 0 });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  mockReset(prismaMock as unknown as DeepMockProxy<typeof prismaMock>);
});

describe("GET /api/cron/payment-reminders", () => {
  it("rejects unauthenticated callers when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "shh";
    // NODE_ENV is typed as readonly by node, use a runtime cast so the
    // assertProductionEnv guard sees the production env.
    (process.env as Record<string, string>).NODE_ENV = "production";

    const res = await GET(new Request("http://localhost/api/cron/payment-reminders"));
    expect(res.status).toBe(401);
    expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
  });

  it("rejects wrong bearer", async () => {
    process.env.CRON_SECRET = "shh";
    const res = await GET(
      new Request("http://localhost/api/cron/payment-reminders", {
        headers: { authorization: "Bearer wrong" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("dispatches due reminders + overdue notices and returns counts", async () => {
    process.env.CRON_SECRET = "shh";
    const dueRow = {
      id: randomUUID(),
      amount: 500,
      currency: "EGP",
      due_date: new Date("2030-01-01"),
      event: { id: randomUUID(), title: "Wedding", client_id: randomUUID() },
    };
    const overdueRow = {
      id: randomUUID(),
      amount: 1000,
      currency: "EGP",
      due_date: new Date("2020-01-01"),
      event: { id: randomUUID(), title: "Birthday", client_id: randomUUID() },
    };
    // findMany is called twice (due, then overdue) - sequence the mocks.
    prismaMock.payment.findMany
      .mockResolvedValueOnce([dueRow] as never)
      .mockResolvedValueOnce([overdueRow] as never);
    // No prior notifications for either row → both are new.
    prismaMock.$queryRaw.mockResolvedValue([] as never);

    const res = await GET(
      new Request("http://localhost/api/cron/payment-reminders", {
        headers: { authorization: "Bearer shh" },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      remindersSent: number;
      overdueSent: number;
    };
    expect(body).toEqual({
      ok: true,
      remindersSent: 1,
      overdueSent: 1,
      staleLeads: { stale: 0, emailed: 0 },
    });
    expect(notifyPaymentDueMock).toHaveBeenCalledOnce();
    expect(notifyPaymentOverdueMock).toHaveBeenCalledOnce();
  });

  it("dedupes installments that already received a notification", async () => {
    process.env.CRON_SECRET = "shh";
    const dueRow = {
      id: randomUUID(),
      amount: 500,
      currency: "EGP",
      due_date: new Date("2030-01-01"),
      event: { id: randomUUID(), title: "Wedding", client_id: randomUUID() },
    };
    prismaMock.payment.findMany
      .mockResolvedValueOnce([dueRow] as never)
      .mockResolvedValueOnce([] as never);
    // Pretend the due-reminder was already sent for this row.
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ installment_id: dueRow.id }] as never)
      .mockResolvedValueOnce([] as never);

    const res = await GET(
      new Request("http://localhost/api/cron/payment-reminders", {
        headers: { authorization: "Bearer shh" },
      })
    );
    const body = (await res.json()) as { remindersSent: number };
    expect(body.remindersSent).toBe(0);
    expect(notifyPaymentDueMock).not.toHaveBeenCalled();
  });

  it("returns 500 when an underlying query throws", async () => {
    process.env.CRON_SECRET = "shh";
    prismaMock.payment.findMany.mockRejectedValue(new Error("DB exploded"));

    const res = await GET(
      new Request("http://localhost/api/cron/payment-reminders", {
        headers: { authorization: "Bearer shh" },
      })
    );
    expect(res.status).toBe(500);
  });

  it("nags about stale leads even when the payment queries fail", async () => {
    process.env.CRON_SECRET = "shh";
    prismaMock.payment.findMany.mockRejectedValue(new Error("DB exploded"));
    staleDigestMock.mockResolvedValue({ stale: 2, emailed: 1 });

    const res = await GET(
      new Request("http://localhost/api/cron/payment-reminders", {
        headers: { authorization: "Bearer shh" },
      })
    );
    expect(res.status).toBe(500);
    expect(staleDigestMock).toHaveBeenCalledOnce();
    expect(await res.json()).toMatchObject({ staleLeads: { stale: 2, emailed: 1 } });
  });

  it("still sends the payment reminders when the stale-lead sweep throws", async () => {
    process.env.CRON_SECRET = "shh";
    staleDigestMock.mockRejectedValue(new Error("enquiries table locked"));
    prismaMock.payment.findMany.mockResolvedValue([] as never);

    const res = await GET(
      new Request("http://localhost/api/cron/payment-reminders", {
        headers: { authorization: "Bearer shh" },
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, staleLeads: null });
  });

  it("does not sweep for an unauthenticated caller", async () => {
    process.env.CRON_SECRET = "shh";
    await GET(new Request("http://localhost/api/cron/payment-reminders"));
    expect(staleDigestMock).not.toHaveBeenCalled();
  });
});
