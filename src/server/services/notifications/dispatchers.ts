import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notify, notifyMany } from "./notify";

/**
 * Per-event typed helpers. Each wraps `notify` with the right NotificationType
 * + link builder so the call sites inside tRPC mutations stay single-line.
 *
 * These are intentionally narrow; if a notification ever needs new vars, the
 * change lives here rather than scattering template names across the
 * codebase.
 */

// ----- Client-facing -----

export function notifyProposalReceived(args: {
  clientUserId: string;
  plannerName: string;
  eventId: string;
  eventTitle: string;
  proposalId: string;
}): Promise<void> {
  return notify({
    userId: args.clientUserId,
    type: "proposal_received",
    link: `/dashboard/client/event/${args.eventId}?tab=proposals`,
    vars: { plannerName: args.plannerName, eventTitle: args.eventTitle },
    data: { eventId: args.eventId, proposalId: args.proposalId },
  });
}

export function notifyProposalWithdrawn(args: {
  clientUserId: string;
  plannerName: string;
  eventId: string;
  eventTitle: string;
}): Promise<void> {
  return notify({
    userId: args.clientUserId,
    type: "proposal_withdrawn",
    link: `/dashboard/client/event/${args.eventId}?tab=proposals`,
    vars: { plannerName: args.plannerName, eventTitle: args.eventTitle },
    data: { eventId: args.eventId },
  });
}

export function notifyPlannerAssigned(args: {
  clientUserId: string;
  plannerName: string;
  eventId: string;
  eventTitle: string;
}): Promise<void> {
  return notify({
    userId: args.clientUserId,
    type: "planner_assigned",
    link: `/dashboard/client/event/${args.eventId}`,
    vars: { plannerName: args.plannerName, eventTitle: args.eventTitle },
    data: { eventId: args.eventId },
  });
}

export function notifyPaymentSchedeProposed(args: {
  clientUserId: string;
  plannerName: string;
  eventId: string;
  eventTitle: string;
  amount: string;
  scheduleId: string;
}): Promise<void> {
  return notify({
    userId: args.clientUserId,
    type: "payment_schedule_proposed",
    link: `/dashboard/client/event/${args.eventId}?tab=payments`,
    vars: {
      plannerName: args.plannerName,
      eventTitle: args.eventTitle,
      amount: args.amount,
    },
    data: { eventId: args.eventId, scheduleId: args.scheduleId },
  });
}

export function notifyScheduleAmendmentProposed(args: {
  recipientUserId: string;
  otherPartyName: string;
  eventId: string;
  eventTitle: string;
  amendmentId: string;
  recipientRole: "client" | "planner";
}): Promise<void> {
  const prefix =
    args.recipientRole === "client"
      ? `/dashboard/client/event/${args.eventId}?tab=payments`
      : `/dashboard/planner/event/${args.eventId}?tab=payments`;
  return notify({
    userId: args.recipientUserId,
    type: "payment_schedule_amendment_proposed",
    link: prefix,
    vars: {
      otherPartyName: args.otherPartyName,
      eventTitle: args.eventTitle,
    },
    data: { eventId: args.eventId, amendmentId: args.amendmentId },
  });
}

export function notifyScheduleAmendmentDecided(args: {
  plannerUserId: string;
  clientName: string;
  eventId: string;
  eventTitle: string;
  amendmentId: string;
  accepted: boolean;
}): Promise<void> {
  return notify({
    userId: args.plannerUserId,
    type: "schedule_amendment_decided",
    link: `/dashboard/planner/event/${args.eventId}?tab=payments`,
    vars: {
      clientName: args.clientName,
      eventTitle: args.eventTitle,
      decision: args.accepted ? "accepted" : "rejected",
    },
    data: {
      eventId: args.eventId,
      amendmentId: args.amendmentId,
      accepted: args.accepted,
    },
  });
}

export function notifyPaymentPaid(args: {
  clientUserId: string;
  eventId: string;
  eventTitle: string;
  amount: string;
  paymentId: string;
}): Promise<void> {
  return notify({
    userId: args.clientUserId,
    type: "payment_paid",
    link: `/dashboard/client/event/${args.eventId}?tab=payments`,
    vars: { eventTitle: args.eventTitle, amount: args.amount },
    data: { eventId: args.eventId, paymentId: args.paymentId },
  });
}

export function notifyPaymentFailed(args: {
  clientUserId: string;
  eventId: string;
  eventTitle: string;
  amount: string;
  paymentId: string;
}): Promise<void> {
  return notify({
    userId: args.clientUserId,
    type: "payment_failed",
    link: `/dashboard/client/event/${args.eventId}?tab=payments`,
    vars: { eventTitle: args.eventTitle, amount: args.amount },
    data: { eventId: args.eventId, paymentId: args.paymentId },
  });
}

export function notifyPaymentRefunded(args: {
  clientUserId: string;
  eventId: string;
  eventTitle: string;
  amount: string;
  paymentId: string;
}): Promise<void> {
  return notify({
    userId: args.clientUserId,
    type: "payment_refunded",
    link: `/dashboard/client/event/${args.eventId}?tab=payments`,
    vars: { eventTitle: args.eventTitle, amount: args.amount },
    data: { eventId: args.eventId, paymentId: args.paymentId },
  });
}

export function notifyPaymentDisputed(args: {
  plannerUserId: string;
  eventId: string;
  eventTitle: string;
  amount: string;
  paymentId: string;
}): Promise<void> {
  return notify({
    userId: args.plannerUserId,
    type: "payment_disputed",
    link: `/dashboard/planner/earnings`,
    vars: { eventTitle: args.eventTitle, amount: args.amount },
    data: { eventId: args.eventId, paymentId: args.paymentId },
  });
}

export function notifyPaymentDue(args: {
  clientUserId: string;
  eventId: string;
  eventTitle: string;
  amount: string;
  dueDate: string;
  paymentId: string;
}): Promise<void> {
  return notify({
    userId: args.clientUserId,
    type: "payment_due_reminder",
    link: `/dashboard/client/event/${args.eventId}?tab=payments`,
    vars: {
      eventTitle: args.eventTitle,
      amount: args.amount,
      dueDate: args.dueDate,
    },
    data: { eventId: args.eventId, installmentId: args.paymentId },
  });
}

export function notifyPaymentOverdue(args: {
  clientUserId: string;
  eventId: string;
  eventTitle: string;
  amount: string;
  dueDate: string;
  paymentId: string;
}): Promise<void> {
  return notify({
    userId: args.clientUserId,
    type: "payment_overdue",
    link: `/dashboard/client/event/${args.eventId}?tab=payments`,
    vars: {
      eventTitle: args.eventTitle,
      amount: args.amount,
      dueDate: args.dueDate,
    },
    data: { eventId: args.eventId, installmentId: args.paymentId },
  });
}

// ----- Planner-facing -----

export function notifyProposalAccepted(args: {
  plannerUserId: string;
  clientName: string;
  eventId: string;
  eventTitle: string;
  proposalId: string;
}): Promise<void> {
  return notify({
    userId: args.plannerUserId,
    type: "proposal_accepted",
    link: `/dashboard/planner/event/${args.eventId}`,
    vars: { clientName: args.clientName, eventTitle: args.eventTitle },
    data: { eventId: args.eventId, proposalId: args.proposalId },
  });
}

export function notifyProposalReleased(args: {
  plannerUserId: string;
  clientName: string;
  eventId: string;
  eventTitle: string;
  rating: number;
  reason: string;
}): Promise<void> {
  return notify({
    userId: args.plannerUserId,
    type: "proposal_released",
    link: `/dashboard/planner/proposals`,
    vars: {
      clientName: args.clientName,
      eventTitle: args.eventTitle,
      rating: args.rating,
    },
    data: {
      eventId: args.eventId,
      rating: args.rating,
      reason: args.reason,
    },
  });
}

export function notifyPaymentReceivedToPlanner(args: {
  plannerUserId: string;
  eventId: string;
  eventTitle: string;
  amount: string;
  netAmount: string;
  paymentId: string;
}): Promise<void> {
  return notify({
    userId: args.plannerUserId,
    type: "payment_received",
    link: `/dashboard/planner/earnings`,
    vars: {
      eventTitle: args.eventTitle,
      amount: args.amount,
      netAmount: args.netAmount,
    },
    data: { eventId: args.eventId, paymentId: args.paymentId },
  });
}

export function notifyPayoutReceived(args: {
  recipientUserId: string;
  role: "planner" | "vendor";
  amount: string;
  method: string;
  reference?: string | null;
  payoutId: string;
}): Promise<void> {
  const refClause = args.reference ? ` Reference: ${args.reference}.` : "";
  const link =
    args.role === "planner"
      ? `/dashboard/planner/earnings`
      : `/dashboard/vendor/earnings`;
  return notify({
    userId: args.recipientUserId,
    type: "payout_received",
    link,
    vars: {
      amount: args.amount,
      method: args.method,
      reference: refClause,
    },
    data: { payoutId: args.payoutId },
  });
}

export function notifyVendorEngagementAccepted(args: {
  plannerUserId: string;
  vendorName: string;
  engagementId: string;
  engagementTitle: string;
}): Promise<void> {
  return notify({
    userId: args.plannerUserId,
    type: "vendor_accepted_engagement",
    link: `/dashboard/planner/vendors`,
    vars: {
      vendorName: args.vendorName,
      engagementTitle: args.engagementTitle,
    },
    data: { engagementId: args.engagementId },
  });
}

export function notifyVendorEngagementDeclined(args: {
  plannerUserId: string;
  vendorName: string;
  engagementId: string;
  engagementTitle: string;
}): Promise<void> {
  return notify({
    userId: args.plannerUserId,
    type: "vendor_declined_engagement",
    link: `/dashboard/planner/vendors`,
    vars: {
      vendorName: args.vendorName,
      engagementTitle: args.engagementTitle,
    },
    data: { engagementId: args.engagementId },
  });
}

export function notifyVendorEngagementCancelledToPlanner(args: {
  plannerUserId: string;
  vendorName: string;
  engagementId: string;
  engagementTitle: string;
}): Promise<void> {
  return notify({
    userId: args.plannerUserId,
    type: "vendor_cancelled_engagement",
    link: `/dashboard/planner/vendors`,
    vars: {
      vendorName: args.vendorName,
      engagementTitle: args.engagementTitle,
    },
    data: { engagementId: args.engagementId },
  });
}

export function notifyReviewReceivedPlanner(args: {
  plannerUserId: string;
  authorName: string;
  rating: number;
  eventId?: string;
}): Promise<void> {
  return notify({
    userId: args.plannerUserId,
    type: "review_received",
    link: `/dashboard/planner/portfolio`,
    vars: { authorName: args.authorName, rating: args.rating },
    data: { eventId: args.eventId ?? null },
  });
}

export function notifyReviewReceivedVendor(args: {
  vendorUserId: string;
  authorName: string;
  rating: number;
  engagementId: string;
}): Promise<void> {
  return notify({
    userId: args.vendorUserId,
    type: "review_received",
    link: `/dashboard/vendor/engagements`,
    vars: { authorName: args.authorName, rating: args.rating },
    data: { engagementId: args.engagementId },
  });
}

// ----- Vendor-facing -----

export function notifyEngagementRequested(args: {
  vendorUserId: string;
  plannerName: string;
  engagementId: string;
  engagementTitle: string;
  totalAmount: string;
  eventTitle: string;
}): Promise<void> {
  return notify({
    userId: args.vendorUserId,
    type: "engagement_requested",
    link: `/dashboard/vendor/inbox`,
    vars: {
      plannerName: args.plannerName,
      engagementTitle: args.engagementTitle,
      totalAmount: args.totalAmount,
      eventTitle: args.eventTitle,
    },
    data: { engagementId: args.engagementId },
  });
}

export function notifyEngagementItemsUpdated(args: {
  vendorUserId: string;
  plannerName: string;
  engagementId: string;
  engagementTitle: string;
  totalAmount: string;
}): Promise<void> {
  return notify({
    userId: args.vendorUserId,
    type: "engagement_items_updated",
    link: `/dashboard/vendor/inbox`,
    vars: {
      plannerName: args.plannerName,
      engagementTitle: args.engagementTitle,
      totalAmount: args.totalAmount,
    },
    data: { engagementId: args.engagementId },
  });
}

export function notifyEngagementCancelledToVendor(args: {
  vendorUserId: string;
  plannerName: string;
  engagementId: string;
  engagementTitle: string;
}): Promise<void> {
  return notify({
    userId: args.vendorUserId,
    type: "engagement_cancelled",
    link: `/dashboard/vendor/inbox`,
    vars: {
      plannerName: args.plannerName,
      engagementTitle: args.engagementTitle,
    },
    data: { engagementId: args.engagementId },
  });
}

// ----- Shared -----

export function notifyMessageReceived(args: {
  recipientUserId: string;
  senderName: string;
  preview: string;
  eventId: string;
  recipientRole: "client" | "planner";
  messageId: string;
}): Promise<void> {
  // The client/planner messages inbox index links each conversation to
  // `/dashboard/<role>/event/<id>?tab=messages`, so we jump straight into
  // the thread rather than making the user click through the index.
  const link =
    args.recipientRole === "client"
      ? `/dashboard/client/event/${args.eventId}?tab=messages`
      : `/dashboard/planner/event/${args.eventId}?tab=messages`;
  return notify({
    userId: args.recipientUserId,
    type: "message_received",
    link,
    vars: { senderName: args.senderName, preview: args.preview },
    data: { eventId: args.eventId, messageId: args.messageId },
  });
}

// ----- Fan-out: new event in service area -----
//
// Surfaces a newly-published event to every planner whose service_cities
// JSON array contains a case-insensitive match of the event's venue. We
// dedupe against prior notifications so re-triggers (e.g. on subsequent
// design swaps) don't spam planners who were already notified.
export async function notifyEventInServiceArea(args: {
  eventId: string;
  clientUserId: string;
  venue: string;
  eventType: string;
  eventTitle: string;
}): Promise<void> {
  if (!args.venue) return;
  const venueLower = args.venue.toLowerCase();

  const planners = await prisma.plannerProfile.findMany({
    where: {
      // Only planners with at least one opted-in city.
      service_cities: { not: Prisma.JsonNull },
    },
    select: {
      user_id: true,
      service_cities: true,
      service_country: true,
    },
  });

  const matched: Array<{ userId: string; matchedCity: string }> = [];
  for (const p of planners) {
    if (p.user_id === args.clientUserId) continue;
    const cities = Array.isArray(p.service_cities)
      ? (p.service_cities as unknown[]).filter(
          (c): c is string => typeof c === "string",
        )
      : [];
    const hit = cities.find((c) => venueLower.includes(c.trim().toLowerCase()));
    if (hit) {
      matched.push({ userId: p.user_id, matchedCity: hit });
    }
  }
  if (matched.length === 0) return;

  // Drop anyone who already got this notification for this event.
  const existing = await prisma.notification.findMany({
    where: {
      type: "event_in_service_area",
      user_id: { in: matched.map((m) => m.userId) },
      data: { path: ["eventId"], equals: args.eventId },
    },
    select: { user_id: true },
  });
  const seen = new Set(existing.map((e) => e.user_id));
  const targets = matched.filter((m) => !seen.has(m.userId));
  if (targets.length === 0) return;

  const cityFor = new Map(targets.map((t) => [t.userId, t.matchedCity]));
  await notifyMany({
    userIds: targets.map((t) => t.userId),
    type: "event_in_service_area",
    link: `/dashboard/planner/marketplace`,
    varsFor: (userId) => ({
      eventType: args.eventType,
      eventTitle: args.eventTitle,
      city: cityFor.get(userId) ?? args.venue,
    }),
    data: { eventId: args.eventId },
  });
}
