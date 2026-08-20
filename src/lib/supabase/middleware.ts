import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getClaims() instead of getUser(): it verifies the access-token JWT
  // signature locally against the project's published JWK (cached after the
  // first call) instead of round-tripping to https://*.supabase.co/auth/v1
  // for every request. Middleware fires on every navigation + every static-
  // adjacent fetch, so this saves ~100-200ms / request from outside Europe.
  const { data: claimsData } = await supabase.auth.getClaims();
  let user = claimsData?.claims
    ? {
        id: claimsData.claims.sub,
        is_anonymous: claimsData.claims.is_anonymous === true,
      }
    : null;

  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isDashboardPage = request.nextUrl.pathname.startsWith("/dashboard");
  const isVenueDesignerPage = request.nextUrl.pathname.startsWith("/venue-designer");
  // The recovery flow authenticates the user with a temporary session so they
  // can update their password. We must allow access to the reset page even
  // when a session exists. The email-confirm + OAuth callback routes also
  // need to remain reachable for permanent users completing email upgrades.
  const isResetPasswordPage =
    request.nextUrl.pathname === "/auth/reset-password";
  const isConfirmPage = request.nextUrl.pathname.startsWith("/auth/confirm");
  const isCallbackPage = request.nextUrl.pathname.startsWith("/auth/callback");

  // Dashboards still require a non-anonymous session.
  if ((!user || user.is_anonymous) && isDashboardPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    return NextResponse.redirect(url);
  }

  // The venue designer is now open to anonymous traffic. If no session
  // exists, mint a Supabase anonymous user so `ctx.user` is non-null for
  // tRPC and the designer's protectedProcedure plumbing keeps working.
  // The cookie handler above writes the new session cookies onto the
  // response so downstream requests in the same nav see the session.
  if (!user && isVenueDesignerPage) {
    const { data: anon, error: anonErr } =
      await supabase.auth.signInAnonymously();
    if (anonErr || !anon.user) {
      // Anonymous sign-in disabled or transient failure, fall through
      // to the signin page so the visitor isn't left on a broken render.
      const url = request.nextUrl.clone();
      url.pathname = "/auth/signin";
      return NextResponse.redirect(url);
    }
    user = { id: anon.user.id, is_anonymous: true };
  }

  // Already-authenticated permanent users hitting /auth/* get bounced to
  // the dashboard. Anonymous users are allowed through so they can
  // confirm a new email and complete the upgrade.
  if (
    user &&
    !user.is_anonymous &&
    isAuthPage &&
    !isResetPasswordPage &&
    !isConfirmPage &&
    !isCallbackPage
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
