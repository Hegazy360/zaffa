import type { UserRole } from "@/types";

// Bridges the gap between the role a user picks on the professional sign-up
// form and the OAuth round-trip to Google. Supabase's `signInWithOAuth` does
// not let us forward arbitrary metadata, and the DB trigger that materializes
// `profiles` always lands on the column default (`client`). So before we
// redirect to Google we drop a short-lived cookie with the intended role,
// then `/auth/callback` reads it and promotes the freshly-created profile.
//
// We deliberately keep this on a non-HttpOnly cookie set from the browser:
// the value is only ever a *hint*. The callback re-validates by checking
// that the user was just created and that their current role is still the
// default `client`, so a tampered cookie can't be used to escalate an
// existing account.

export const PENDING_ROLE_COOKIE = "zaffa_pending_role";

// 5 minutes is plenty for an OAuth round-trip (typical real-world latency
// is < 30s) and short enough that a stale cookie from a previous attempt
// can't bleed into an unrelated sign-in session.
export const PENDING_ROLE_TTL_SECONDS = 5 * 60;

// Only roles that make sense to promote *to* via this flow. We never let
// OAuth grant `admin`, and `client` is already the default so there's
// nothing to promote.
const OAUTH_PROMOTABLE_ROLES = ["planner", "vendor"] as const;

export type OAuthPromotableRole = (typeof OAUTH_PROMOTABLE_ROLES)[number];

export function isOAuthPromotableRole(
  value: string | null | undefined,
): value is OAuthPromotableRole {
  return (
    typeof value === "string" &&
    (OAUTH_PROMOTABLE_ROLES as readonly string[]).includes(value)
  );
}

// Window during which we trust the `created_at` of an auth user as "this
// person just signed up via OAuth, promote them". Generous enough to absorb
// network blips on either leg of the redirect; tight enough that a returning
// user can't be silently re-roled by a stale or planted cookie.
export const OAUTH_FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

// `client` is the column default: a freshly-minted Google user always
// starts here, so promotion is always *upward* from this value. We refuse
// to overwrite anything else (planner, vendor, admin) as a safety net.
export const PROMOTABLE_FROM_ROLE: UserRole = "client";
