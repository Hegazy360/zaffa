import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";

const WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";

const {
  prismaMock,
  dispatchersMock,
  captureServerMock,
  retrievePIMock,
  visionPackMock,
  headerStore,
} = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  // Mutable bag the next/headers mock reads per-call so each test can
  // configure the stripe-signature header without re-mocking the module.
  const headerStore: { current: string | null } = { current: null };
  return {
    prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>(),
    dispatchersMock: {
      notifyPaymentDisputed: vi.fn(),
      notifyPaymentFailed: vi.fn(),
      notifyPaymentPaid: vi.fn(),
      notifyPaymentReceivedToPlanner: vi.fn(),
      notifyPaymentRefunded: vi.fn(),
      notifyVisionPackReady: vi.fn(),
    },
    captureServerMock: vi.fn(),
    retrievePIMock: vi.fn(),
    visionPackMock: {
      activatePackFromCheckout: vi.fn(),
      expirePendingCheckout: vi.fn(),
    },
    headerStore,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/services/notifications/dispatchers", () => dispatchersMock);
vi.mock("@/server/routers/vision-packs", () => visionPackMock);
vi.mock("@/lib/posthog", () => ({ captureServer: captureServerMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) =>
      name.toLowerCase() === "stripe-signature" ? headerStore.current : null,
  }),
}));

// We let the real Stripe SDK do signature verification + event parsing —
// only the network surface is stubbed (paymentIntents.retrieve, etc.).
vi.mock("@/lib/stripe", async () => {
  const StripeMod = (await import("stripe")).default;
  const stripeInstance = new StripeMod("sk_test_dummy_for_signing", {
    apiVersion: "2026-02-25.clover",
    typescript: true,
  });
  (stripeInstance.paymentIntents as unknown as { retrieve: unknown }).retrieve =
    retrievePIMock;
  return { getStripe: () => stripeInstance };
});

const { POST } = await import("@/app/api/webhooks/stripe/route");

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  for (const fn of Object.values(dispatchersMock)) fn.mockReset();
  for (const fn of Object.values(visionPackMock)) fn.mockReset();
  captureServerMock.mockReset();
  retrievePIMock.mockReset();
  retrievePIMock.mockResolvedValue({ latest_charge: "ch_test_123" });
  visionPackMock.activatePackFromCheckout.mockResolvedValue(undefined);
  visionPackMock.expirePendingCheckout.mockResolvedValue(undefined);
});

afterEach(() => {
  mockReset(prismaMock as unknown as DeepMockProxy<typeof prismaMock>);
});

function buildEvent(type: string, dataObject: Record<string, unknown>) {
  // Stripe lets us craft a raw event body for testing. The shape doesn't
  // need to be byte-identical to the live API — only the fields the
  // handler reads matter.
  const event = {
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    api_version: "2026-02-25.clover",
    created: Math.floor(Date.now() / 1000),
    data: { object: dataObject },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
  };
  return JSON.stringify(event);
}

async function dispatch(body: string): Promise<Response> {
  headerStore.current = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: WEBHOOK_SECRET,
  });
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body,
    })
  );
}

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 when the signature header is missing", async () => {
    headerStore.current = null;
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the signature is invalid", async () => {
    headerStore.current = "t=1,v1=deadbeef";
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      })
    );
    expect(res.status).toBe(400);
  });

  it("acks unhandled event types with 200 and skips DB writes", async () => {
    const body = buildEvent("customer.subscription.created", { id: "sub_x" });
    const res = await dispatch(body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ignored?: boolean };
    expect(json.ignored).toBe(true);
    expect(prismaMock.stripeWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("dedupes duplicate event ids (returns 200 deduped)", async () => {
    prismaMock.stripeWebhookEvent.create.mockRejectedValueOnce(
      new Error("unique violation")
    );
    const body = buildEvent("checkout.session.completed", {
      id: "cs_test_dup",
      metadata: { installmentId: randomUUID() },
    });
    const res = await dispatch(body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deduped?: boolean };
    expect(json.deduped).toBe(true);
    expect(prismaMock.payment.findUnique).not.toHaveBeenCalled();
  });

  it("checkout.session.completed flips installment to paid + computes fee/net", async () => {
    const installmentId = randomUUID();
    const eventId = randomUUID();
    const scheduleId = randomUUID();
    const clientId = randomUUID();
    const plannerUserId = randomUUID();

    prismaMock.stripeWebhookEvent.create.mockResolvedValue({} as never);
    prismaMock.stripeWebhookEvent.update.mockResolvedValue({} as never);
    prismaMock.payment.findUnique
      .mockResolvedValueOnce({
        id: installmentId,
        amount: 1000,
        currency: "EGP",
        schedule: { id: scheduleId, platform_fee_pct: 8, currency: "EGP" },
      } as never)
      .mockResolvedValueOnce({
        id: installmentId,
        currency: "EGP",
        event: { id: eventId, title: "Wedding", client_id: clientId },
        schedule: { planner: { user_id: plannerUserId } },
      } as never);
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      const cb = fn as (tx: typeof prismaMock) => Promise<unknown>;
      prismaMock.payment.update.mockResolvedValueOnce({} as never);
      prismaMock.payment.count.mockResolvedValueOnce(0);
      prismaMock.paymentSchedule.update.mockResolvedValueOnce({} as never);
      return cb(prismaMock);
    });

    const body = buildEvent("checkout.session.completed", {
      id: "cs_test_ok",
      amount_total: 100000, // 1000.00 EGP in piastres
      payment_intent: "pi_test_123",
      metadata: { installmentId },
    });
    const res = await dispatch(body);
    expect(res.status).toBe(200);

    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: installmentId },
        data: expect.objectContaining({
          status: "paid",
          amount: 1000,
          platform_fee_amount: 80, // 8% of 1000
          net_to_planner_amount: 920,
          stripe_payment_intent_id: "pi_test_123",
        }),
      })
    );
    // No remaining open installments → schedule flips to completed.
    expect(prismaMock.paymentSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: scheduleId },
        data: { status: "completed" },
      })
    );
    expect(dispatchersMock.notifyPaymentPaid).toHaveBeenCalled();
    expect(dispatchersMock.notifyPaymentReceivedToPlanner).toHaveBeenCalled();
    expect(captureServerMock).toHaveBeenCalledWith(
      clientId,
      expect.any(String),
      expect.objectContaining({ amount: 1000, fee: 80, net: 920 })
    );
  });

  it("checkout.session.completed routes vision_pack metadata to the pack handler", async () => {
    const packId = randomUUID();
    const buyerId = randomUUID();
    const recipientId = randomUUID();

    prismaMock.stripeWebhookEvent.create.mockResolvedValue({} as never);
    prismaMock.stripeWebhookEvent.update.mockResolvedValue({} as never);
    // `amount` is stored in minor units now (Stripe-aligned cents/piastres);
    // 49900 piastres = EGP 499 retail. The analytics handler converts back
    // to major units for the `amount` field and also emits `amount_minor`.
    prismaMock.visionPack.findUnique.mockResolvedValue({
      id: packId,
      sku: "wedding_design_pack_v1",
      recipient_user_id: recipientId,
      buyer_user_id: buyerId,
      amount: 49900,
      currency: "EGP",
    } as never);

    const body = buildEvent("checkout.session.completed", {
      id: "cs_test_pack",
      payment_intent: "pi_pack_123",
      metadata: { kind: "vision_pack", packId },
    });
    const res = await dispatch(body);
    expect(res.status).toBe(200);

    expect(visionPackMock.activatePackFromCheckout).toHaveBeenCalledWith({
      packId,
      paymentIntentId: "pi_pack_123",
    });
    expect(dispatchersMock.notifyVisionPackReady).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: recipientId,
        packId,
      }),
    );
    expect(captureServerMock).toHaveBeenCalledWith(
      buyerId,
      expect.any(String),
      expect.objectContaining({
        pack_id: packId,
        amount: 499,
        amount_minor: 49900,
      }),
    );
    // Installment path is NOT touched.
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it("checkout.session.expired with vision_pack metadata expires the pending pack", async () => {
    const packId = randomUUID();
    prismaMock.stripeWebhookEvent.create.mockResolvedValue({} as never);
    prismaMock.stripeWebhookEvent.update.mockResolvedValue({} as never);

    const body = buildEvent("checkout.session.expired", {
      id: "cs_test_expired",
      metadata: { kind: "vision_pack", packId },
    });
    const res = await dispatch(body);
    expect(res.status).toBe(200);

    expect(visionPackMock.expirePendingCheckout).toHaveBeenCalledWith(packId);
    // Installment expiration path not touched.
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalled();
  });

  // ---- Concierge installments (Payment Links) ----------------------------
  //
  // This lane is deliberately simpler than the planner one: no schedule, and
  // no platform fee, because on the concierge plan Zaffa IS the provider
  // rather than a marketplace taking a cut. Those null fee columns are what
  // mark a row as first-party revenue, so they are asserted explicitly.

  it("concierge installment: flips to paid with NO fee split", async () => {
    const installmentId = randomUUID();
    prismaMock.stripeWebhookEvent.create.mockResolvedValue({} as never);
    prismaMock.stripeWebhookEvent.update.mockResolvedValue({} as never);
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: installmentId,
      currency: "AED",
      amount: 30000,
      event_id: randomUUID(),
      status: "awaiting_payment",
    } as never);
    prismaMock.payment.update.mockResolvedValue({} as never);
    prismaMock.enquiry.findUnique.mockResolvedValue(null as never);

    const body = buildEvent("checkout.session.completed", {
      id: "cs_test_concierge",
      metadata: { kind: "concierge_installment", installmentId },
      amount_total: 3000000,
      payment_intent: null,
    });
    const res = await dispatch(body);
    expect(res.status).toBe(200);

    const data = prismaMock.payment.update.mock.calls[0][0].data;
    expect(data.status).toBe("paid");
    expect(data.amount).toBe(30000);
    // Never a marketplace split on this lane.
    expect(data).not.toHaveProperty("platform_fee_amount");
    expect(data).not.toHaveProperty("net_to_planner_amount");
  });

  it("concierge installment: advances the enquiry to deposit_paid", async () => {
    const installmentId = randomUUID();
    const enquiryId = randomUUID();
    prismaMock.stripeWebhookEvent.create.mockResolvedValue({} as never);
    prismaMock.stripeWebhookEvent.update.mockResolvedValue({} as never);
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: installmentId,
      currency: "AED",
      amount: 30000,
      event_id: randomUUID(),
      status: "awaiting_payment",
    } as never);
    prismaMock.payment.update.mockResolvedValue({} as never);
    prismaMock.enquiry.findUnique.mockResolvedValue({
      id: enquiryId,
      status: "quote_sent",
    } as never);
    prismaMock.enquiry.update.mockResolvedValue({} as never);

    await dispatch(
      buildEvent("checkout.session.completed", {
        id: "cs_test_concierge_enq",
        metadata: { kind: "concierge_installment", installmentId, enquiryId },
        amount_total: 3000000,
        payment_intent: null,
      })
    );
    // Paying the deposit IS acceptance on this plan; there is no separate
    // accept step for the couple to complete.
    expect(prismaMock.enquiry.update.mock.calls[0][0].data.status).toBe("deposit_paid");
  });

  it("concierge installment: never double-applies an already-paid row", async () => {
    const installmentId = randomUUID();
    prismaMock.stripeWebhookEvent.create.mockResolvedValue({} as never);
    prismaMock.stripeWebhookEvent.update.mockResolvedValue({} as never);
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: installmentId,
      currency: "AED",
      amount: 30000,
      event_id: randomUUID(),
      status: "paid",
    } as never);

    await dispatch(
      buildEvent("checkout.session.completed", {
        id: "cs_test_concierge_replay",
        metadata: { kind: "concierge_installment", installmentId },
        amount_total: 3000000,
        payment_intent: null,
      })
    );
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it("concierge installment: ignores a session with no installmentId", async () => {
    prismaMock.stripeWebhookEvent.create.mockResolvedValue({} as never);
    prismaMock.stripeWebhookEvent.update.mockResolvedValue({} as never);
    const res = await dispatch(
      buildEvent("checkout.session.completed", {
        id: "cs_test_concierge_noid",
        metadata: { kind: "concierge_installment" },
      })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

});
