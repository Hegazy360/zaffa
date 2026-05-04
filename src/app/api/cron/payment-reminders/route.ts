import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/env-checks";
import { logger, reportError } from "@/lib/logger";
import { formatMoney } from "@/server/routers/payment-schedules";
import {
  notifyPaymentDue,
  notifyPaymentOverdue,
} from "@/server/services/notifications/dispatchers";

/**
 * Once-a-day cron that emits two families of time-based notifications:
 *
 *   1. `payment_due_reminder` — for installments becoming due in 3 days.
 *   2. `payment_overdue`      — for installments past due and still open.
 *
 * Condensed into a single endpoint because the Vercel Hobby plan caps us
 * to one cron run per day. Dedupe is per-installment: we skip any row
 * where a Notification of the matching type already references
 * `data.installmentId`, so re-running the cron is a no-op.
 *
 * Register in `vercel.json`:
 *   { "crons": [{ "path": "/api/cron/payment-reminders", "schedule": "0 9 * * *" }] }
 *
 * Auth follows the existing discovery-tick convention: header
 * `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is configured.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// How far ahead of due_date we send the reminder, in days.
const REMINDER_LEAD_DAYS = 3;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const remindersSent = await sendDueReminders();
    const overdueSent = await sendOverdueNotices();
    logger.info("cron.payment_reminders.success", {
      remindersSent,
      overdueSent,
    });
    return NextResponse.json({ ok: true, remindersSent, overdueSent });
  } catch (err) {
    reportError("cron.payment_reminders.failed", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

/** Installments becoming due `REMINDER_LEAD_DAYS` from today (date only). */
async function sendDueReminders(): Promise<number> {
  const start = startOfDayUTC(addDays(new Date(), REMINDER_LEAD_DAYS));
  const end = addDays(start, 1);
  const due = await prisma.payment.findMany({
    where: {
      status: { in: ["pending", "awaiting_payment"] },
      due_date: { gte: start, lt: end },
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      due_date: true,
      event: { select: { id: true, title: true, client_id: true } },
    },
  });
  return dispatchMissing(due, "payment_due_reminder", (row) =>
    notifyPaymentDue({
      clientUserId: row.event.client_id,
      eventId: row.event.id,
      eventTitle: row.event.title,
      amount: formatMoney(Number(row.amount), row.currency),
      dueDate: row.due_date ? row.due_date.toISOString().slice(0, 10) : "",
      paymentId: row.id,
    }),
  );
}

/** Installments whose `due_date` is strictly in the past and still open. */
async function sendOverdueNotices(): Promise<number> {
  const today = startOfDayUTC(new Date());
  const due = await prisma.payment.findMany({
    where: {
      status: { in: ["pending", "awaiting_payment"] },
      due_date: { lt: today },
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      due_date: true,
      event: { select: { id: true, title: true, client_id: true } },
    },
  });
  return dispatchMissing(due, "payment_overdue", (row) =>
    notifyPaymentOverdue({
      clientUserId: row.event.client_id,
      eventId: row.event.id,
      eventTitle: row.event.title,
      amount: formatMoney(Number(row.amount), row.currency),
      dueDate: row.due_date ? row.due_date.toISOString().slice(0, 10) : "",
      paymentId: row.id,
    }),
  );
}

type InstallmentRow = {
  id: string;
  amount: unknown;
  currency: string;
  due_date: Date | null;
  event: { id: string; title: string; client_id: string };
};

async function dispatchMissing(
  rows: InstallmentRow[],
  type: "payment_due_reminder" | "payment_overdue",
  dispatch: (row: InstallmentRow) => Promise<void>,
): Promise<number> {
  if (rows.length === 0) return 0;
  // Pre-query existing Notification rows of this type pointing at any of
  // our installments so we don't double-send. Prisma's JsonFilter doesn't
  // support `in`, so we use a raw query hitting the jsonb ->> operator
  // with an ANY($1::text[]) array (one round-trip instead of N lookups).
  const installmentIds = rows.map((r) => r.id);
  const existing = await prisma.$queryRaw<{ installment_id: string }[]>`
    select data->>'installmentId' as installment_id
    from notifications
    where type = ${type}::notification_type
      and data->>'installmentId' = any(${installmentIds}::text[])
  `;
  const seen = new Set(existing.map((e) => e.installment_id));
  const todo = rows.filter((r) => !seen.has(r.id));
  for (const row of todo) {
    await dispatch(row);
  }
  return todo.length;
}

function startOfDayUTC(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}
