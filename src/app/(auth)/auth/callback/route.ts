import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  PENDING_ROLE_COOKIE,
  PROMOTABLE_FROM_ROLE,
  OAUTH_FRESHNESS_WINDOW_MS,
  isOAuthPromotableRole,
} from "@/lib/auth/pending-role";

// `expired` keywords (Supabase) commonly include "expired" / "invalid".
// We map them to the friendly reasons consumed by /auth/error.
function classify(message: string): "expired" | "invalid" | "unknown" {
  const lower = message.toLowerCase();
  if (lower.includes("expired")) return "expired";
  if (lower.includes("invalid") || lower.includes("not found")) return "invalid";
  return "unknown";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/error?reason=missing_code", origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/error?reason=${classify(error.message)}`, origin),
    );
  }

  // Best-effort role reconciliation for OAuth sign-ups coming from the
  // professional flow. The DB trigger `handle_new_user` only knows about
  // `full_name` / `avatar_url`, so a planner/vendor signing up via Google
  // would otherwise land on the column default `client`. We bridge the
  // gap with a short-lived cookie set on the way out (see OAuthButtons).
  await reconcilePendingRole();

  return NextResponse.redirect(new URL("/dashboard", origin));
}

async function reconcilePendingRole(): Promise<void> {
  const cookieStore = await cookies();
  const pendingCookie = cookieStore.get(PENDING_ROLE_COOKIE);
  if (!pendingCookie) return;

  // Always clear the cookie — it's one-shot intent, regardless of whether
  // we actually end up promoting. If we leave it lying around it could
  // bleed into a later OAuth round-trip from the same browser.
  cookieStore.set(PENDING_ROLE_COOKIE, "", { path: "/", maxAge: 0 });

  let pendingRole: string;
  try {
    pendingRole = decodeURIComponent(pendingCookie.value);
  } catch {
    pendingRole = pendingCookie.value;
  }
  if (!isOAuthPromotableRole(pendingRole)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Freshness gate: only promote users who were just minted by this OAuth
  // exchange. Without it, a returning client could plant a cookie and
  // silently re-role themselves on their next Google sign-in.
  const createdAtMs = new Date(user.created_at).getTime();
  if (Number.isNaN(createdAtMs)) return;
  if (Date.now() - createdAtMs > OAUTH_FRESHNESS_WINDOW_MS) return;

  // The `eq("role", PROMOTABLE_FROM_ROLE)` clause is a second safety net:
  // we only ever overwrite the column default. Admins, planners, and
  // vendors are immune even if the freshness gate were somehow bypassed.
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role: pendingRole })
    .eq("id", user.id)
    .eq("role", PROMOTABLE_FROM_ROLE);

  if (updateError) {
    logger.warn("auth.callback.role_promotion_failed", {
      err: updateError,
      userId: user.id,
      pendingRole,
    });
  }
}
