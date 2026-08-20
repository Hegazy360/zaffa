import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";

// vi.mock factories are hoisted above import statements, so the module the
// factory references must be loaded from inside vi.hoisted() (also hoisted).
const { prismaMock, stripeMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  const prismaMock = mockDeep<typeof import("@/lib/prisma").prisma>();
  const stripeMock = {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  };
  return { prismaMock, stripeMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripeMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { paymentsRouter } from "@/server/routers/payments";

import { randomUUID } from "node:crypto";

const CLIENT_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const INSTALLMENT_ID = randomUUID();
const SCHEDULE_ID = randomUUID();
const EVENT_ID = randomUUID();
const PLANNER_ID = randomUUID();

function callerForUser(userId: string) {
  return paymentsRouter.createCaller({
    // Cast around the supabase shape, the router only ever reads ctx.user.
    supabase: {} as never,
    user: { id: userId } as never,
  } as never);
}

function buildInstallment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INSTALLMENT_ID,
    label: "Deposit",
    amount: 1000,
    currency: "EGP",
    status: "pending" as const,
    event: {
      id: EVENT_ID,
      client_id: CLIENT_ID,
      title: "Sample Event",
    },
    schedule: {
      id: SCHEDULE_ID,
      status: "active" as const,
      currency: "EGP",
      planner_id: PLANNER_ID,
    },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.PAYMENT_SUCCESS_URL_BASE = "https://example.test";
  process.env.PLATFORM_NAME = "Zaffa";
  stripeMock.checkout.sessions.create.mockReset();
  stripeMock.checkout.sessions.create.mockResolvedValue({
    id: "cs_test_123",
    url: "https://stripe.test/cs_test_123",
  });
});

afterEach(() => {
  mockReset(prismaMock as unknown as DeepMockProxy<typeof prismaMock>);
});

describe("paymentsRouter.createCheckoutSession", () => {
  it("rejects callers who are not the event client", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(buildInstallment() as never);

    await expect(
      callerForUser(OTHER_USER_ID).createCheckoutSession({
        installmentId: INSTALLMENT_ID,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("404s when the installment is missing", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);
    await expect(
      callerForUser(CLIENT_ID).createCheckoutSession({
        installmentId: INSTALLMENT_ID,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects when the schedule isn't active or amended", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildInstallment({
        schedule: {
          id: SCHEDULE_ID,
          status: "draft",
          currency: "EGP",
          planner_id: PLANNER_ID,
        },
      }) as never
    );

    await expect(
      callerForUser(CLIENT_ID).createCheckoutSession({
        installmentId: INSTALLMENT_ID,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects when the installment isn't payable", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildInstallment({ status: "paid" }) as never
    );

    await expect(
      callerForUser(CLIENT_ID).createCheckoutSession({
        installmentId: INSTALLMENT_ID,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("creates a checkout session and persists awaiting_payment + session id", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(buildInstallment() as never);
    prismaMock.$queryRaw.mockResolvedValue([{ email: "client@example.test" }] as never);
    prismaMock.payment.update.mockResolvedValue({} as never);

    const out = await callerForUser(CLIENT_ID).createCheckoutSession({
      installmentId: INSTALLMENT_ID,
    });

    expect(out).toEqual({
      url: "https://stripe.test/cs_test_123",
      id: "cs_test_123",
    });
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledOnce();
    const [args] = stripeMock.checkout.sessions.create.mock.calls[0];
    // 1000 EGP -> 100000 piastres (EGP is 2-decimal in our table).
    expect(args.line_items[0].price_data.unit_amount).toBe(100000);
    expect(args.line_items[0].price_data.currency).toBe("egp");
    expect(args.metadata.installmentId).toBe(INSTALLMENT_ID);
    expect(args.customer_email).toBe("client@example.test");
    expect(args.success_url).toContain(`/dashboard/client/event/${EVENT_ID}`);

    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: INSTALLMENT_ID },
      data: {
        status: "awaiting_payment",
        stripe_checkout_session_id: "cs_test_123",
      },
    });
  });

  it("swallows email lookup failures and still creates the session (no customer_email)", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(buildInstallment() as never);
    prismaMock.$queryRaw.mockRejectedValue(new Error("auth schema unreachable"));
    prismaMock.payment.update.mockResolvedValue({} as never);

    const out = await callerForUser(CLIENT_ID).createCheckoutSession({
      installmentId: INSTALLMENT_ID,
    });
    expect(out.id).toBe("cs_test_123");

    const [args] = stripeMock.checkout.sessions.create.mock.calls[0];
    // No email available → customer_email is omitted entirely.
    expect(args.customer_email).toBeUndefined();
    expect(args.payment_intent_data.receipt_email).toBeUndefined();
  });
});
