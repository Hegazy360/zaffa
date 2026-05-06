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
  // adjacent fetch, so this saves ~100–200ms / request from outside Europe.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ? { id: claimsData.claims.sub } : null;

  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isDashboardPage = request.nextUrl.pathname.startsWith("/dashboard");
  const isVenueDesignerPage = request.nextUrl.pathname.startsWith("/venue-designer");
  // The recovery flow authenticates the user with a temporary session so they
  // can update their password. We must allow access to the reset page even
  // when a session exists.
  const isResetPasswordPage =
    request.nextUrl.pathname === "/auth/reset-password";

  if (!user && (isDashboardPage || isVenueDesignerPage)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage && !isResetPasswordPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
