// All PostHog event names live here so call sites can't typo. Importable
// from anywhere (server, client, edge) — it's just strings, no runtime
// dependencies.
//
// Naming convention: `noun.verb_in_past_tense`, snake_case, lower-case.
// Properties on the event are passed at the call site; person properties
// (role, locale) live on the identified user via `posthog.identify`.

export const ANALYTICS_EVENTS = {
  // Auth & activation -------------------------------------------------------
  AUTH_SIGNED_UP: "auth.signed_up",
  AUTH_SIGNED_IN: "auth.signed_in",
  ONBOARDING_STARTED: "onboarding.started",
  ONBOARDING_COMPLETED: "onboarding.completed",
  PROFILE_PUBLISHED: "profile.published",

  // Couple journey ----------------------------------------------------------
  DESIGN_CREATED: "design.created",
  DESIGN_RENDER_GENERATED: "design.render_generated",
  DESIGN_VIDEO_GENERATED: "design.video_generated",
  DESIGN_APPROVED: "design.approved",
  EVENT_CREATED: "event.created",
  PROPOSAL_RECEIVED: "proposal.received",
  PROPOSAL_ACCEPTED: "proposal.accepted",
  PAYMENT_SUCCEEDED: "payment.succeeded",
  REVIEW_POSTED: "review.posted",

  // Planner journey ---------------------------------------------------------
  BRIEF_VIEWED: "brief.viewed",
  PROPOSAL_SENT: "proposal.sent",
  VENDOR_SEARCHED: "vendor.searched",
  VENDOR_ENGAGEMENT_REQUESTED: "vendor.engagement_requested",
  RELEASE_QUEUED: "release.queued",
  PAYOUT_REQUESTED: "payout.requested",

  // Vendor journey ----------------------------------------------------------
  SERVICE_ADDED: "service.added",
  PORTFOLIO_ADDED: "portfolio.added",
  ENGAGEMENT_ACCEPTED: "engagement.accepted",
  ENGAGEMENT_DECLINED: "engagement.declined",
  ENGAGEMENT_DELIVERED: "engagement.delivered",

  // Account hygiene ---------------------------------------------------------
  ACCOUNT_DELETION_SCHEDULED: "account.deletion_scheduled",
  ACCOUNT_DELETION_CANCELLED: "account.deletion_cancelled",
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
