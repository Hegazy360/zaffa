import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { computeFee, fromStripeAmount } from "@/lib/payments";
import { logger, reportError } from "@/lib/logger";
import { captureServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { formatMoney } from "@/server/routers/payment-schedules";
import {
  notifyPaymentDisputed,
  notifyPaymentFailed,
  notifyPaymentPaid,
  notifyPaymentReceivedToPlanner,
  notifyPaymentRefunded,
} from "@/server/services/notifications/dispatchers";

// All Stripe webhook events that bear on the payment system. We treat the
// list as a whitelist; anything else is acknowledged with 200 + logged so we
// can spot drift when Stripe ships new event types we may want to opt into.
const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.failed",
  "charge.refunded",
  "charge.refund.updated",
  "charge.dispute.created",
  "charge.dispute.closed",
  "charge.dispute.updated",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "radar.early_fraud_warning.created",
  "radar.early_fraud_warning.updated",
]);

// Suffix we append to `dispute_status` when Stripe has actually pulled funds
// out of our balance. Using a colon-suffix keeps the underlying Stripe status
// (`needs_response`, `under_review`, etc.) intact so the existing UI keeps
// working — the suffix is purely additive context for admin payouts.
const FUNDS_WITHDRAWN_SUFFIX = ":funds_withdrawn";

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const installmentId = session.metadata?.installmentId;
  if (!installmentId) return;
  const installment = await prisma.payment.findUnique({
    where: { id: installmentId },
    include: {
      schedule: {
        select: { id: true, platform_fee_pct: true, currency: true },
      },
    },
  });
  if (!installment || !installment.schedule) return;

  // The Checkout session may have come back before any charge object is
  // attached (very rare). When it has, prefer the live amount on Stripe so
  // partial-pay or currency oddities are exact.
  const grossFromStripe =
    session.amount_total != null
      ? fromStripeAmount(session.amount_total, installment.currency)
      : Number(installment.amount);
  const { feeAmount, netAmount } = computeFee(
    grossFromStripe,
    Number(installment.schedule.platform_fee_pct)
  );

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Pull the charge so we can store the charge id (used by refund handling).
  let chargeId: string | null = null;
  if (paymentIntentId) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const latest = pi.latest_charge;
      if (typeof latest === "string") chargeId = latest;
      else if (latest && typeof latest === "object") chargeId = latest.id;
    } catch {
      // Non-fatal — we'll just skip the charge id.
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: installmentId },
      data: {
        status: "paid",
        paid_at: new Date(),
        amount: grossFromStripe,
        platform_fee_amount: feeAmount,
        net_to_planner_amount: netAmount,
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: chargeId,
      },
    });
    // If every installment on the schedule is now paid, mark the schedule
    // completed. We only count the schedule complete if there is no
    // pending/awaiting/failed/refunded row left.
    const remaining = await tx.payment.count({
      where: {
        schedule_id: installment.schedule!.id,
        status: { in: ["pending", "awaiting_payment", "processing", "failed"] },
      },
    });
    if (remaining === 0) {
      await tx.paymentSchedule.update({
        where: { id: installment.schedule!.id },
        data: { status: "completed" },
      });
    }
  });

  // Notify both sides of a successful payment. The client gets a receipt;
  // the planner gets credited earnings. We do this after the txn so a
  // flaky provider can't un-commit the payment state.
  const notifyCtx = await prisma.payment.findUnique({
    where: { id: installmentId },
    select: {
      id: true,
      currency: true,
      event: {
        select: { id: true, title: true, client_id: true },
      },
      schedule: {
        select: {
          planner: { select: { user_id: true } },
        },
      },
    },
  });
  if (notifyCtx) {
    const amountStr = formatMoney(grossFromStripe, notifyCtx.currency);
    await notifyPaymentPaid({
      clientUserId: notifyCtx.event.client_id,
      eventId: notifyCtx.event.id,
      eventTitle: notifyCtx.event.title,
      amount: amountStr,
      paymentId: notifyCtx.id,
    });
    const plannerUserId = notifyCtx.schedule?.planner?.user_id;
    if (plannerUserId) {
      await notifyPaymentReceivedToPlanner({
        plannerUserId,
        eventId: notifyCtx.event.id,
        eventTitle: notifyCtx.event.title,
        amount: amountStr,
        netAmount: formatMoney(netAmount, notifyCtx.currency),
        paymentId: notifyCtx.id,
      });
    }

    // Funnel signal: this is the moment money actually reaches us. Captured
    // against the client's distinctId so the couple-journey funnel stitches
    // browser pageviews + this server-side ground truth into one person.
    await captureServer(
      notifyCtx.event.client_id,
      ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
      {
        event_id: notifyCtx.event.id,
        payment_id: notifyCtx.id,
        amount: grossFromStripe,
        fee: feeAmount,
        net: netAmount,
        currency: notifyCtx.currency,
      },
    );
  }
}

// Stripe sends `checkout.session.expired` ~24h after a session was created
// without payment. Without this handler the installment is stuck in
// `awaiting_payment` forever. Reverting to `pending` re-enables the
// "Pay now" button so the client can retry.
async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const installmentId = session.metadata?.installmentId;
  if (!installmentId) return;
  await prisma.payment.updateMany({
    where: {
      id: installmentId,
      status: "awaiting_payment",
      stripe_checkout_session_id: session.id,
    },
    data: {
      status: "pending",
      stripe_checkout_session_id: null,
    },
  });
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const installmentId = pi.metadata?.installmentId;
  if (!installmentId) return;
  const updated = await prisma.payment.updateMany({
    where: {
      id: installmentId,
      status: { in: ["awaiting_payment", "processing"] },
    },
    data: { status: "failed" },
  });
  if (updated.count === 0) return;

  // Let the client know so they can retry with a different method. We only
  // hit this branch when the payment actually transitioned — idempotent
  // webhook replays are a no-op.
  const installment = await prisma.payment.findUnique({
    where: { id: installmentId },
    select: {
      id: true,
      amount: true,
      currency: true,
      event: { select: { id: true, title: true, client_id: true } },
    },
  });
  if (installment) {
    await notifyPaymentFailed({
      clientUserId: installment.event.client_id,
      eventId: installment.event.id,
      eventTitle: installment.event.title,
      amount: formatMoney(Number(installment.amount), installment.currency),
      paymentId: installment.id,
    });
  }
}

// charge.failed mirrors payment_intent.payment_failed for legacy charges
// that didn't come through a PaymentIntent. We back into the installment
// via metadata or the stored charge id.
async function handleChargeFailed(charge: Stripe.Charge) {
  const installmentId =
    charge.metadata?.installmentId ?? null;
  const installment = await prisma.payment.findFirst({
    where: installmentId
      ? { id: installmentId }
      : { stripe_charge_id: charge.id },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      event: { select: { id: true, title: true, client_id: true } },
    },
  });
  if (!installment) return;
  if (!["awaiting_payment", "processing"].includes(installment.status)) return;
  await prisma.payment.update({
    where: { id: installment.id },
    data: { status: "failed" },
  });
  await notifyPaymentFailed({
    clientUserId: installment.event.client_id,
    eventId: installment.event.id,
    eventTitle: installment.event.title,
    amount: formatMoney(Number(installment.amount), installment.currency),
    paymentId: installment.id,
  });
}

// Refund handling: every Stripe refund object becomes one PaymentRefund
// row, even on partial refunds. We aggregate the refunded total and only
// flip the installment to "refunded" once it equals (or exceeds) the
// original gross — otherwise it goes to "partially_refunded" so the UI
// can show remaining balance. Also computes the delta vs `refunded_amount`
// so admin-initiated refunds (which already flagged the row) don't double
// count when the webhook arrives.
async function handleRefunded(charge: Stripe.Charge) {
  const installment = await prisma.payment.findFirst({
    where: { stripe_charge_id: charge.id },
    select: {
      id: true,
      amount: true,
      currency: true,
      refunded_amount: true,
      event: { select: { id: true, title: true, client_id: true } },
    },
  });
  if (!installment) return;

  const refundsList = charge.refunds?.data ?? [];
  if (refundsList.length === 0) return;

  for (const refund of refundsList) {
    const amount = fromStripeAmount(refund.amount, installment.currency);
    await prisma.paymentRefund.upsert({
      where: { stripe_refund_id: refund.id },
      create: {
        payment_id: installment.id,
        stripe_refund_id: refund.id,
        amount,
        currency: installment.currency,
        reason: refund.reason ?? null,
      },
      update: {},
    });
  }

  // Recompute aggregate from the ledger so partial-refund math is exact.
  const agg = await prisma.paymentRefund.aggregate({
    where: { payment_id: installment.id },
    _sum: { amount: true },
  });
  const refundedTotal = Number(agg._sum.amount ?? 0);
  const gross = Number(installment.amount);
  const fullyRefunded = refundedTotal >= gross - 0.005;

  const lastRefundId = refundsList[refundsList.length - 1]!.id;
  await prisma.payment.update({
    where: { id: installment.id },
    data: {
      status: fullyRefunded ? "refunded" : "partially_refunded",
      refunded_amount: refundedTotal,
      stripe_refund_id: lastRefundId,
    },
  });

  // Notify only on a state change; if the cumulative didn't actually
  // increase (replay) skip the noisy email/in-app blast.
  const prevRefunded = Number(installment.refunded_amount);
  if (refundedTotal > prevRefunded + 0.005) {
    await notifyPaymentRefunded({
      clientUserId: installment.event.client_id,
      eventId: installment.event.id,
      eventTitle: installment.event.title,
      amount: formatMoney(refundedTotal - prevRefunded, installment.currency),
      paymentId: installment.id,
    });
  }
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const installment = await prisma.payment.findFirst({
    where: { stripe_charge_id: chargeId },
    select: {
      id: true,
      amount: true,
      currency: true,
      event: {
        select: { id: true, title: true, client_id: true },
      },
      schedule: {
        select: { planner: { select: { user_id: true } } },
      },
    },
  });
  if (!installment) return;
  await prisma.payment.update({
    where: { id: installment.id },
    data: {
      disputed_at: new Date(),
      dispute_status: dispute.status,
      dispute_resolved_at: null,
    },
  });
  const plannerUserId = installment.schedule?.planner?.user_id;
  if (plannerUserId) {
    await notifyPaymentDisputed({
      plannerUserId,
      eventId: installment.event.id,
      eventTitle: installment.event.title,
      amount: formatMoney(Number(installment.amount), installment.currency),
      paymentId: installment.id,
    });
  }
}

async function handleDisputeClosed(dispute: Stripe.Dispute) {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  await prisma.payment.updateMany({
    where: { stripe_charge_id: chargeId },
    data: {
      dispute_status: dispute.status,
      dispute_resolved_at: new Date(),
    },
  });
}

// Async checkout failure (bank redirects, BNPL, SEPA — anything where
// Checkout returns "processing" and finalises later). Mirrors the
// PaymentIntent failure path so the client can retry with a different
// method instead of being stuck in `awaiting_payment`.
async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  const installmentId = session.metadata?.installmentId;
  if (!installmentId) return;
  const updated = await prisma.payment.updateMany({
    where: {
      id: installmentId,
      status: { in: ["awaiting_payment", "processing"] },
    },
    data: { status: "failed" },
  });
  if (updated.count === 0) return;

  const installment = await prisma.payment.findUnique({
    where: { id: installmentId },
    select: {
      id: true,
      amount: true,
      currency: true,
      event: { select: { id: true, title: true, client_id: true } },
    },
  });
  if (installment) {
    await notifyPaymentFailed({
      clientUserId: installment.event.client_id,
      eventId: installment.event.id,
      eventTitle: installment.event.title,
      amount: formatMoney(Number(installment.amount), installment.currency),
      paymentId: installment.id,
    });
  }
}

// Explicit `payment_intent.canceled` — different from `checkout.expired`
// (idle timeout) and from `payment_failed` (declined). Stripe support /
// admin tools can fire this; we mirror it locally so the row doesn't
// stay parked in `awaiting_payment` forever.
async function handlePaymentIntentCanceled(pi: Stripe.PaymentIntent) {
  const installmentId = pi.metadata?.installmentId ?? null;
  await prisma.payment.updateMany({
    where: installmentId
      ? { id: installmentId, status: { in: ["awaiting_payment", "processing"] } }
      : {
          stripe_payment_intent_id: pi.id,
          status: { in: ["awaiting_payment", "processing"] },
        },
    data: { status: "cancelled" },
  });
}

// `charge.refund.updated` covers the rare case where a refund object
// changes state after issue — most commonly a refund failing to settle on
// a bank-side failure. We walk the parent payment back from
// `refunded`/`partially_refunded` if Stripe reverses the refund.
async function handleRefundUpdated(refund: Stripe.Refund) {
  const ledgerRow = await prisma.paymentRefund.findUnique({
    where: { stripe_refund_id: refund.id },
    select: { payment_id: true, amount: true },
  });
  if (!ledgerRow) {
    // Refund created externally / before our code ran — nothing to update.
    return;
  }

  // Only act on terminal failure. `succeeded` (or `null` for legacy refunds)
  // is the no-op happy path we already handled in `handleRefunded`.
  if (refund.status !== "failed" && refund.status !== "canceled") return;

  logger.warn("stripe.refund.reversed", {
    refundId: refund.id,
    paymentId: ledgerRow.payment_id,
    status: refund.status,
    failureReason: refund.failure_reason ?? null,
  });

  await prisma.$transaction(async (tx) => {
    await tx.paymentRefund.delete({ where: { stripe_refund_id: refund.id } });
    const agg = await tx.paymentRefund.aggregate({
      where: { payment_id: ledgerRow.payment_id },
      _sum: { amount: true },
    });
    const remaining = Number(agg._sum.amount ?? 0);
    const payment = await tx.payment.findUnique({
      where: { id: ledgerRow.payment_id },
      select: { amount: true },
    });
    if (!payment) return;
    const gross = Number(payment.amount);
    let nextStatus: "paid" | "partially_refunded" | "refunded" = "paid";
    if (remaining > 0) {
      nextStatus = remaining >= gross - 0.005 ? "refunded" : "partially_refunded";
    }
    await tx.payment.update({
      where: { id: ledgerRow.payment_id },
      data: { refunded_amount: remaining, status: nextStatus },
    });
  });
}

// `charge.dispute.updated` fires whenever the dispute's stage changes —
// we just mirror Stripe's status string. Dedupes when the value didn't
// actually change so we don't churn `updated_at`.
async function handleDisputeUpdated(dispute: Stripe.Dispute) {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const current = await prisma.payment.findFirst({
    where: { stripe_charge_id: chargeId },
    select: { id: true, dispute_status: true },
  });
  if (!current) return;

  // Preserve the `:funds_withdrawn` suffix if it was set previously and
  // funds haven't been reinstated yet.
  const hadSuffix = current.dispute_status?.endsWith(FUNDS_WITHDRAWN_SUFFIX) ?? false;
  const next = hadSuffix
    ? `${dispute.status}${FUNDS_WITHDRAWN_SUFFIX}`
    : dispute.status;
  if (current.dispute_status === next) return;
  await prisma.payment.update({
    where: { id: current.id },
    data: { dispute_status: next },
  });
}

async function handleDisputeFundsWithdrawn(dispute: Stripe.Dispute) {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const row = await prisma.payment.findFirst({
    where: { stripe_charge_id: chargeId },
    select: {
      id: true,
      amount: true,
      currency: true,
      dispute_status: true,
      event: { select: { id: true, title: true, client_id: true } },
      schedule: { select: { planner: { select: { user_id: true } } } },
    },
  });
  if (!row) return;
  const base = (row.dispute_status ?? dispute.status).replace(
    FUNDS_WITHDRAWN_SUFFIX,
    "",
  );
  await prisma.payment.update({
    where: { id: row.id },
    data: { dispute_status: `${base}${FUNDS_WITHDRAWN_SUFFIX}` },
  });
  logger.warn("stripe.dispute.funds_withdrawn", {
    paymentId: row.id,
    chargeId,
    disputeId: dispute.id,
  });
  // Re-notify the planner — funds being yanked is materially different
  // from "a dispute was opened" and they need to know to stop counting it.
  const plannerUserId = row.schedule?.planner?.user_id;
  if (plannerUserId) {
    await notifyPaymentDisputed({
      plannerUserId,
      eventId: row.event.id,
      eventTitle: row.event.title,
      amount: formatMoney(Number(row.amount), row.currency),
      paymentId: row.id,
    });
  }
}

async function handleDisputeFundsReinstated(dispute: Stripe.Dispute) {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const row = await prisma.payment.findFirst({
    where: { stripe_charge_id: chargeId },
    select: { id: true, dispute_status: true },
  });
  if (!row) return;
  const base = (row.dispute_status ?? dispute.status).replace(
    FUNDS_WITHDRAWN_SUFFIX,
    "",
  );
  await prisma.payment.update({
    where: { id: row.id },
    data: { dispute_status: base },
  });
  logger.info("stripe.dispute.funds_reinstated", {
    paymentId: row.id,
    chargeId,
    disputeId: dispute.id,
  });
}

// `radar.early_fraud_warning.*` — Stripe's heads-up that a chargeback is
// likely. We don't yet model EFWs as their own table; surfacing through
// the same dispute notification path lets the planner act proactively
// (e.g. issue a refund before it becomes a real chargeback).
async function handleEarlyFraudWarning(
  efw: Stripe.Radar.EarlyFraudWarning,
) {
  const chargeId =
    typeof efw.charge === "string" ? efw.charge : efw.charge.id;
  const row = await prisma.payment.findFirst({
    where: { stripe_charge_id: chargeId },
    select: {
      id: true,
      amount: true,
      currency: true,
      event: { select: { id: true, title: true, client_id: true } },
      schedule: { select: { planner: { select: { user_id: true } } } },
    },
  });
  logger.warn("stripe.efw", {
    chargeId,
    fraudType: efw.fraud_type,
    actionable: efw.actionable,
    paymentId: row?.id ?? null,
  });
  if (!row) return;
  if (!efw.actionable) return;
  const plannerUserId = row.schedule?.planner?.user_id;
  if (plannerUserId) {
    await notifyPaymentDisputed({
      plannerUserId,
      eventId: row.event.id,
      eventTitle: row.event.title,
      amount: formatMoney(Number(row.amount), row.currency),
      paymentId: row.id,
    });
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const headerList = await headers();
  const sig = headerList.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  if (!HANDLED.has(event.type)) {
    // Log so we can spot Stripe shipping a new event type we may want to
    // opt into. Still acks 200 so Stripe doesn't retry.
    logger.info("stripe.webhook.unhandled", {
      type: event.type,
      eventId: event.id,
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  // Idempotency: insert before the handler runs. On duplicate, short-circuit
  // with 200 so Stripe doesn't keep retrying. We mark `processed_at` after
  // the handler succeeds so we can detect interrupted runs in admin tools
  // (a NULL processed_at means we crashed mid-handler).
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        // Async-method success behaves identically to the sync happy path
        // — by the time this event lands the funds have actually settled.
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "checkout.session.expired":
        await handleCheckoutExpired(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "checkout.session.async_payment_failed":
        await handleAsyncPaymentFailed(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.canceled":
        await handlePaymentIntentCanceled(
          event.data.object as Stripe.PaymentIntent
        );
        break;
      case "charge.failed":
        await handleChargeFailed(event.data.object as Stripe.Charge);
        break;
      case "charge.refunded":
        await handleRefunded(event.data.object as Stripe.Charge);
        break;
      case "charge.refund.updated":
        await handleRefundUpdated(event.data.object as Stripe.Refund);
        break;
      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      case "charge.dispute.closed":
        await handleDisputeClosed(event.data.object as Stripe.Dispute);
        break;
      case "charge.dispute.updated":
        await handleDisputeUpdated(event.data.object as Stripe.Dispute);
        break;
      case "charge.dispute.funds_withdrawn":
        await handleDisputeFundsWithdrawn(event.data.object as Stripe.Dispute);
        break;
      case "charge.dispute.funds_reinstated":
        await handleDisputeFundsReinstated(
          event.data.object as Stripe.Dispute
        );
        break;
      case "radar.early_fraud_warning.created":
      case "radar.early_fraud_warning.updated":
        await handleEarlyFraudWarning(
          event.data.object as Stripe.Radar.EarlyFraudWarning
        );
        break;
    }
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { processed_at: new Date() },
    });
  } catch (err) {
    reportError("stripe.webhook.failed", err, {
      eventType: event.type,
      eventId: event.id,
    });
    // Roll back the dedupe row so Stripe's retry can re-attempt — the
    // alternative (silent black hole) is worse than the small risk of
    // duplicate side effects on a transient failure.
    await prisma.stripeWebhookEvent
      .delete({ where: { id: event.id } })
      .catch(() => undefined);
    return NextResponse.json(
      { error: "Handler failure" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
