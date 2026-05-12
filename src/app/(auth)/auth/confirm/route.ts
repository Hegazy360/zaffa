import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/logger";

// Mirror the small classifier in callback/route.ts so confirm-link failures
// land on the same branded /auth/error page with a meaningful reason.
function classify(message: string): "expired" | "invalid" | "unknown" {
  const lower = message.toLowerCase();
  if (lower.includes("expired")) return "expired";
  if (lower.includes("invalid") || lower.includes("not found")) return "invalid";
  return "unknown";
}

// Handles email-link confirmations (recovery, signup, magiclink, invite, email_change).
// Use this with email templates that pass `{{ .TokenHash }}` so the verification
// happens server-side and the session is established via cookies — no URL hash.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Some Supabase email templates pass the destination through as
  // `redirect_to` instead of `next`. We honor whichever is present so
  // both the anonymous email-gate flow (which sets `next=/r/{renderId}`
  // via `emailRedirectTo`) and the canonical token-hash template work.
  const next =
    searchParams.get("next") ?? searchParams.get("redirect_to") ?? "/dashboard";

  // Only allow same-origin redirects to prevent open-redirect abuse.
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  if (!token_hash || !type) {
    return NextResponse.redirect(
      new URL("/auth/error?reason=missing_token", origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/error?reason=${classify(error.message)}`, origin),
    );
  }

  // For `email_change` confirmations originating from the anonymous
  // email-gate flow, flip any pending `email_capture_events` row for
  // this user to `confirmed` so the analytics funnel reflects the
  // upgrade and the Resend reconcile cron doesn't keep retrying it.
  if (type === "email_change") {
    try {
      const { data: claims } = await supabase.auth.getClaims();
      const userId = claims?.claims?.sub;
      if (userId) {
        await prisma.emailCaptureEvent.updateMany({
          where: {
            anon_user_id: userId,
            status: { in: ["pending", "sent"] },
          },
          data: { status: "confirmed" },
        });
      }
    } catch (err) {
      // Non-fatal — the user's session is established either way. Log
      // so the reconcile cron / analytics dashboard can show drift.
      reportError("auth.confirm.email_capture_update_failed", err);
    }
  }

  return NextResponse.redirect(new URL(safeNext, origin));
}
