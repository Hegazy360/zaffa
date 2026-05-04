import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";

const { prismaMock, dispatchersMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  const prismaMock = mockDeep<typeof import("@/lib/prisma").prisma>();
  const dispatchersMock = {
    notifyPaymentSchedeProposed: vi.fn(),
    notifyScheduleAmendmentDecided: vi.fn(),
    notifyScheduleAmendmentProposed: vi.fn(),
  };
  return { prismaMock, dispatchersMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/services/notifications/dispatchers", () => dispatchersMock);

import { paymentSchedulesRouter } from "@/server/routers/payment-schedules";

import { randomUUID } from "node:crypto";

const PLANNER_USER_ID = randomUUID();
const CLIENT_USER_ID = randomUUID();
const PROPOSAL_ID = randomUUID();
const EVENT_ID = randomUUID();
const PLANNER_ID = randomUUID();
const SCHEDULE_ID = randomUUID();
const AMENDMENT_ID = randomUUID();

function caller(userId: string) {
  return paymentSchedulesRouter.createCaller({
    supabase: {} as never,
    user: { id: userId } as never,
  } as never);
}

beforeEach(() => {
  for (const fn of Object.values(dispatchersMock)) fn.mockReset();
});

afterEach(() => {
  mockReset(prismaMock as unknown as DeepMockProxy<typeof prismaMock>);
});

describe("paymentSchedulesRouter.propose", () => {
  it("rejects callers who don't own the proposal", async () => {
    prismaMock.proposal.findUnique.mockResolvedValue({
      id: PROPOSAL_ID,
      event_id: EVENT_ID,
      planner_id: PLANNER_ID,
      quote_currency: "EGP",
      status: "pending",
      planner: { user_id: "someone-else" },
      event: { client_id: CLIENT_USER_ID },
    } as never);

    await expect(
      caller(PLANNER_USER_ID).propose({
        proposalId: PROPOSAL_ID,
        installments: [{ label: "Deposit", amount: 1000 }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when total is zero", async () => {
    prismaMock.proposal.findUnique.mockResolvedValue({
      id: PROPOSAL_ID,
      event_id: EVENT_ID,
      planner_id: PLANNER_ID,
      quote_currency: "EGP",
      status: "pending",
      planner: { user_id: PLANNER_USER_ID },
      event: { client_id: CLIENT_USER_ID },
    } as never);

    await expect(
      caller(PLANNER_USER_ID).propose({
        proposalId: PROPOSAL_ID,
        installments: [{ label: "Deposit", amount: 0 }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("creates schedule + installments + notifies the client on happy path", async () => {
    prismaMock.proposal.findUnique
      .mockResolvedValueOnce({
        id: PROPOSAL_ID,
        event_id: EVENT_ID,
        planner_id: PLANNER_ID,
        quote_currency: "EGP",
        status: "pending",
        planner: { user_id: PLANNER_USER_ID },
        event: { client_id: CLIENT_USER_ID },
      } as never)
      .mockResolvedValueOnce({
        planner: { business_name: "Cairo Atelier", profile: { full_name: "Yasmin" } },
        event: { title: "October Wedding" },
      } as never);

    // Minimal $transaction stub: invoke the callback with the same prisma mock.
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      const cb = fn as (tx: typeof prismaMock) => Promise<unknown>;
      // Inside the txn: replaceable lookup → none, then create + createMany + findUnique.
      prismaMock.paymentSchedule.findFirst.mockResolvedValueOnce(null);
      prismaMock.paymentSchedule.create.mockResolvedValueOnce({
        id: SCHEDULE_ID,
      } as never);
      prismaMock.payment.createMany.mockResolvedValueOnce({ count: 2 } as never);
      prismaMock.paymentSchedule.findUnique.mockResolvedValueOnce({
        id: SCHEDULE_ID,
        currency: "EGP",
        installments: [],
      } as never);
      return cb(prismaMock);
    });

    const result = await caller(PLANNER_USER_ID).propose({
      proposalId: PROPOSAL_ID,
      installments: [
        { label: "Deposit", amount: 500 },
        { label: "Final", amount: 1500 },
      ],
    });

    expect(result).toMatchObject({ id: SCHEDULE_ID });
    expect(prismaMock.paymentSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_id: EVENT_ID,
          proposal_id: PROPOSAL_ID,
          planner_id: PLANNER_ID,
          client_id: CLIENT_USER_ID,
          status: "proposed",
          total_amount: 2000,
        }),
      })
    );
    expect(dispatchersMock.notifyPaymentSchedeProposed).toHaveBeenCalledWith(
      expect.objectContaining({
        clientUserId: CLIENT_USER_ID,
        plannerName: "Cairo Atelier",
        eventTitle: "October Wedding",
        amount: "2000 EGP",
      })
    );
  });
});

describe("paymentSchedulesRouter.acceptProposed", () => {
  it("only allows the event client", async () => {
    prismaMock.paymentSchedule.findUnique.mockResolvedValue({
      id: SCHEDULE_ID,
      status: "proposed",
      proposal: { id: PROPOSAL_ID, status: "pending", planner_id: PLANNER_ID },
      event: { id: EVENT_ID, client_id: CLIENT_USER_ID, planner_id: null },
    } as never);

    await expect(
      caller(PLANNER_USER_ID).acceptProposed({ scheduleId: SCHEDULE_ID })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects non-proposed schedules", async () => {
    prismaMock.paymentSchedule.findUnique.mockResolvedValue({
      id: SCHEDULE_ID,
      status: "active",
      proposal: { id: PROPOSAL_ID, status: "accepted", planner_id: PLANNER_ID },
      event: { id: EVENT_ID, client_id: CLIENT_USER_ID, planner_id: null },
    } as never);

    await expect(
      caller(CLIENT_USER_ID).acceptProposed({ scheduleId: SCHEDULE_ID })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("paymentSchedulesRouter.decideAmendment", () => {
  it("won't let the requester decide their own amendment", async () => {
    prismaMock.scheduleAmendment.findUnique.mockResolvedValue({
      id: AMENDMENT_ID,
      schedule_id: SCHEDULE_ID,
      status: "pending",
      requested_by_user_id: PLANNER_USER_ID,
      schedule: {
        planner: { user_id: PLANNER_USER_ID },
        event: { client_id: CLIENT_USER_ID },
      },
    } as never);

    await expect(
      caller(PLANNER_USER_ID).decideAmendment({
        amendmentId: AMENDMENT_ID,
        accept: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects already-decided amendments", async () => {
    prismaMock.scheduleAmendment.findUnique.mockResolvedValue({
      id: AMENDMENT_ID,
      schedule_id: SCHEDULE_ID,
      status: "rejected",
      requested_by_user_id: PLANNER_USER_ID,
      schedule: {
        planner: { user_id: PLANNER_USER_ID },
        event: { client_id: CLIENT_USER_ID },
      },
    } as never);

    await expect(
      caller(CLIENT_USER_ID).decideAmendment({
        amendmentId: AMENDMENT_ID,
        accept: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
