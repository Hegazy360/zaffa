import { createClient } from "@/lib/supabase/server";

/**
 * Slim shape of "the current user" used by client-side components that
 * just need to render an avatar / name / email. Mirrors the subset of
 * Supabase JWT claims we actually consume.
 */
export type NavUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  /**
   * True for Supabase anonymous users (created via `signInAnonymously`).
   * These are first-touch venue-designer visitors who haven't entered an
   * email yet. The navbar should treat them as logged-out for marketing
   * affordances, even though they technically have a JWT.
   */
  isAnonymous: boolean;
};

/**
 * Locally-verified current user lookup. Reads the access-token cookie,
 * verifies the JWT signature against the project's published JWK
 * (ES256/RS256 - fetched once and cached by supabase-js), and returns
 * the slim user shape. Returns null for anonymous visitors.
 *
 * IMPORTANT: this does NOT hit the Supabase Auth API, so it's roughly
 * 0ms after the first call (vs. ~100-200ms per `auth.getUser()` from
 * MENA → eu-west-1). Use it anywhere a network round-trip per request
 * is wasteful - middleware, layout guards, navbar shells, etc.
 *
 * For sensitive checks where you need the *latest* revocation state
 * (e.g. just-changed password, just-deleted account), prefer
 * `supabase.auth.getUser()`, which re-validates with Supabase Auth.
 */
export async function getNavUser(): Promise<NavUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const claims = data.claims as Record<string, unknown> & {
    sub?: string;
    email?: string;
    is_anonymous?: boolean;
    user_metadata?: Record<string, unknown>;
  };
  if (!claims.sub) return null;

  const meta = (claims.user_metadata ?? {}) as {
    full_name?: unknown;
    avatar_url?: unknown;
  };
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    fullName: typeof meta.full_name === "string" ? meta.full_name : null,
    avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
    isAnonymous: claims.is_anonymous === true,
  };
}
