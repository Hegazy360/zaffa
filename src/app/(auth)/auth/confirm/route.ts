import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Handles email-link confirmations (recovery, signup, magiclink, invite, email_change).
// Use this with email templates that pass `{{ .TokenHash }}` so the verification
// happens server-side and the session is established via cookies — no URL hash.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  // Only allow same-origin redirects to prevent open-redirect abuse.
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  if (!token_hash || !type) {
    return NextResponse.redirect(
      new URL("/auth/signin?error=missing_token", origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/auth/signin?error=${encodeURIComponent(error.message)}`,
        origin
      )
    );
  }

  return NextResponse.redirect(new URL(safeNext, origin));
}
