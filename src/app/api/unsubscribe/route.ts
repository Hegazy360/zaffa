import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/server/services/notifications/unsubscribe-token";
import { appBaseUrl } from "@/server/services/notifications/app-url";
import { consume, ipFromRequest } from "@/lib/rate-limit";

/**
 * Public one-click unsubscribe endpoint linked from every transactional
 * email footer. Validates the HMAC-signed token, flips
 * `profiles.email_unsubscribed_at`, then redirects to a tiny confirmation
 * page. We deliberately keep this unauthenticated so the link still works
 * from any mail client without requiring a sign-in round-trip.
 *
 * Also supports POST for RFC 8058 "List-Unsubscribe=One-Click" mail
 * client compatibility.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const base = appBaseUrl();

  // Soft rate-limit per IP so a token-fuzzing attacker can't enumerate
  // user ids by brute force. The limiter is a no-op when Redis isn't
  // configured (local dev).
  const limit = await consume("unsubscribe", ipFromRequest(req));
  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  if (!token) {
    return NextResponse.redirect(`${base}/unsubscribed?error=1`);
  }

  let verified: { userId: string } | null = null;
  try {
    verified = verifyUnsubscribeToken(token);
  } catch {
    // Secret missing or misconfigured — treat as invalid token from the
    // user's perspective rather than a 500, so the email link still lands
    // somewhere sensible.
    verified = null;
  }

  if (!verified) {
    return NextResponse.redirect(`${base}/unsubscribed?error=1`);
  }

  await prisma.profile.update({
    where: { id: verified.userId },
    data: { email_unsubscribed_at: new Date() },
  });

  return NextResponse.redirect(`${base}/unsubscribed?ok=1`);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
