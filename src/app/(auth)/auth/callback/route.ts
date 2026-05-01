import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  return NextResponse.redirect(new URL("/dashboard", origin));
}
