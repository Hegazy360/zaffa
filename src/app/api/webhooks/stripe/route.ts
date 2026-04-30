import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { computeFee, fromStripeAmount } from "@/lib/payments";

// All Stripe webhook events that bear on the payment system. We treat the
// list as a whitelist; anything else is acknowledged with 200 but ignored.
const HANDLED = new Set([
  "checkout.session.completed",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
]);

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
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const installmentId = pi.metadata?.installmentId;
  if (!installmentId) return;
  await prisma.payment.updateMany({
    where: {
      id: installmentId,
      status: { in: ["awaiting_payment", "processing"] },
    },
    data: { status: "failed" },
  });
}

async function handleRefunded(charge: Stripe.Charge) {
  const installment = await prisma.payment.findFirst({
    where: { stripe_charge_id: charge.id },
    select: { id: true, payout_id: true },
  });
  if (!installment) return;
  // Stripe sends `charge.refunded` for both partial and full refunds. Treat
  // any refund as "refunded" for now; partials get a follow-up note. Admin
  // resolves payout claw-back manually if the installment was already in a
  // Payout (we don't auto-clobber the Payout total).
  const refundId = charge.refunds?.data?.[0]?.id ?? null;
  await prisma.payment.update({
    where: { id: installment.id },
    data: {
      status: "refunded",
      stripe_refund_id: refundId,
    },
  });
}

async function handleDispute(dispute: Stripe.Dispute) {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  await prisma.payment.updateMany({
    where: { stripe_charge_id: chargeId },
    data: { disputed_at: new Date() },
  });
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
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await handleRefunded(event.data.object as Stripe.Charge);
        break;
      case "charge.dispute.created":
        await handleDispute(event.data.object as Stripe.Dispute);
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error", event.type, err);
    return NextResponse.json(
      { error: "Handler failure" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
