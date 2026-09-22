// Synchronous, env-only feature flag API. Safe to import from anywhere
// (server components, client components, edge runtime) - has zero runtime
// dependencies beyond `process.env`.
//
// For per-user PostHog evaluation use `isFlagEnabledFor` from
// `@/lib/flags-server` (server-only because it pulls in the PostHog Node
// SDK + `server-only` guard).
//
// Resolution order, in priority:
//   1. Env-var override `FLAG_<UPPER_SNAKE>` (always wins; lets us hard-flip
//      a flag from Vercel settings without touching PostHog).
//   2. The hard-coded `DEFAULTS` below.
//
// Naming: `FLAG_<UPPER_SNAKE>`. Defaults are kept conservative, flipping a
// flag off should always be the safer choice in case PostHog is unreachable.

export const FLAG_PREFIX = "FLAG_";

export const KNOWN = {
  // Public planner / vendor browse pages. Currently OFF, exposes the
  // commercially sensitive vendor catalog (pricing, portfolios) and the
  // full planner directory unauthenticated. Flip on (env override or
  // PostHog) once we want SEO-driven acquisition.
  publicBrowse: "PUBLIC_BROWSE",
  // Admin verification toggle, flip off to hide the new toggle in
  // /dashboard/admin/users/[id] without redeploying.
  plannerVerification: "PLANNER_VERIFICATION",
  // Onboarding wizard for planners + vendors. Off = old setup-needed
  // splash, on = multi-step wizard.
  onboardingWizard: "ONBOARDING_WIZARD",
  // Every planner/vendor-facing surface: their dashboards and the
  // professional signup route. Currently OFF, the business pivoted to
  // serving the paying couple directly (they self-serve the AI packs, or
  // hire us and we assemble the package by hand), so the two-sided
  // marketplace is hidden rather than deleted. ~25 pages and 10 routers stay
  // in the tree behind this flag; flip it on to bring the whole side back.
  // The E2E suite forces it on, because money-path.spec.ts drives planner
  // flows. See docs/plan-pivot-2026-08.md Phase 0.2.
  professionalSurfaces: "PROFESSIONAL_SURFACES",
  // Testimonials on the marketing pages. OFF until the first weddings are
  // delivered and real couples have said something we are allowed to quote.
  // The section reads `src/lib/testimonials.ts`, which is empty on purpose -
  // so even flipping this on cannot produce an invented quote. See ZAF-45.
  testimonials: "TESTIMONIALS",
  // The published fee table on /pricing and the price line on the homepage.
  // ON by default - D9 is a decision, not an experiment. The flag exists for
  // one reason: /enquire and published pricing went live days apart, so the
  // with-price / without-price comparison cannot be reconstructed from deploy
  // history. Each enquiry records the flag state it was submitted under
  // (`Enquiry.pricing_published`), which keeps that comparison possible if it
  // is ever wanted. See docs/pricing-published-2026-08.md.
  publishedPricing: "PUBLISHED_PRICING",
  // The AI chat widget (floating launcher + homepage section) AND its
  // backend: `chat.ask` refuses when this is off, which is the instant
  // kill - the ISR'd homepage can lag a flag flip by up to 300s, but the
  // procedure check cannot. OFF by default until the launch QA in en+ar
  // passes and the OpenRouter account has credits (ZAF-85).
  aiChat: "AI_CHAT",
  // The design partner release (docs/plan-design-partner-2026-09.md). Five
  // flags, one per feature, all ON by default: each is a kill switch, not a
  // rollout. Every one is checked in its tRPC procedure as well as in the
  // UI, because the procedure check is the instant one (an ISR'd page can
  // lag a flip by up to 300s) and it is what actually stops the spend.
  // `FLAG_<NAME>=0` in Vercel settings turns a feature off without a deploy.
  //
  // F1: the couple uploads a photo of their own venue and the render dresses
  // that exact space. Off refuses `venueDesigns.uploadVenuePhoto`, and the
  // dress-venue render mode reads the same flag.
  // `FLAG_VENUE_PHOTO=0` is the kill switch.
  venuePhoto: "VENUE_PHOTO",
  // F2: "what would you change?" under a render, a talked edit on the edit
  // image model, reserved against the pack's edits quota. Off stops
  // `ai.refineRender` before any quota is reserved or model called.
  // `FLAG_REFINE_RENDER=0` is the kill switch.
  refineRender: "REFINE_RENDER",
  // F3: a cheap LLM read of the brief before the one precious free render
  // (notes say garden, setting says indoor). Off skips the check and the
  // render goes ahead on the raw inputs, as it did before the release.
  // `FLAG_INTAKE_CHECK=0` is the kill switch.
  intakeCheck: "INTAKE_CHECK",
  // F4: the itemised, costed decor plan under a render. It shows prices on
  // a money surface, so if a pricing row turns out wrong this is how it
  // comes down while the table is fixed. `FLAG_DECOR_PLAN=0` is the kill
  // switch.
  decorPlan: "DECOR_PLAN",
  // F6: private share links where family vote on a design's versions. The
  // only feature that serves design content to people with no session, so
  // it gets its own switch in case a link leaks or votes get abused.
  // `FLAG_FAMILY_SHARE=0` is the kill switch.
  familyShare: "FAMILY_SHARE",
} as const;

export type FlagKey = keyof typeof KNOWN;

const DEFAULTS: Record<FlagKey, boolean> = {
  // OFF, see comment on `publicBrowse` above.
  publicBrowse: false,
  plannerVerification: true,
  onboardingWizard: true,
  // OFF, see comment on `professionalSurfaces` above.
  professionalSurfaces: false,
  // OFF, see comment on `testimonials` above.
  testimonials: false,
  // ON, see comment on `publishedPricing` above.
  publishedPricing: true,
  // OFF, see comment on `aiChat` above.
  aiChat: false,
  // ON, the design partner kill switches, see comments above.
  venuePhoto: true,
  refineRender: true,
  intakeCheck: true,
  decorPlan: true,
  familyShare: true,
};

export function parseFlagValue(value: string | undefined): boolean | null {
  if (value == null) return null;
  const v = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(v)) return true;
  if (["0", "false", "off", "no"].includes(v)) return false;
  return null;
}

export function envOverride(key: FlagKey): boolean | null {
  const envName = `${FLAG_PREFIX}${KNOWN[key]}`;
  return parseFlagValue(process.env[envName]);
}

/**
 * Synchronous flag check, env override or static default only.
 * Use this in code paths that can't await (React render trees, hot loops).
 * For per-user / segmented rollouts, prefer `isFlagEnabledFor` from
 * `@/lib/flags-server`.
 */
export function isFlagEnabled(key: FlagKey): boolean {
  const fromEnv = envOverride(key);
  if (fromEnv != null) return fromEnv;
  return DEFAULTS[key];
}

/** All known flag keys (for debugging dashboards or admin UIs). */
export function listFlags(): Array<{ key: FlagKey; enabled: boolean }> {
  return (Object.keys(KNOWN) as FlagKey[]).map((key) => ({
    key,
    enabled: isFlagEnabled(key),
  }));
}
