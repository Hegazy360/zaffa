// Reasons we attach to the URL when the auth/callback or auth/confirm route
// handlers can't establish a session. Kept short and stable so deep links from
// Supabase email templates remain meaningful.
export type AuthErrorReason =
  | "missing_code"
  | "missing_token"
  | "expired"
  | "invalid"
  | "unknown";

const REASONS: ReadonlySet<AuthErrorReason> = new Set([
  "missing_code",
  "missing_token",
  "expired",
  "invalid",
  "unknown",
]);

// Translation keys live under the `auth.errors` namespace.
export type AuthErrorReasonKey =
  | "missingCode"
  | "missingToken"
  | "expired"
  | "invalid"
  | "unknown";

export function authErrorReasonKey(
  reason: AuthErrorReason | string | null | undefined,
): AuthErrorReasonKey {
  if (!reason || !REASONS.has(reason as AuthErrorReason)) return "unknown";
  switch (reason as AuthErrorReason) {
    case "missing_code":
      return "missingCode";
    case "missing_token":
      return "missingToken";
    case "expired":
      return "expired";
    case "invalid":
      return "invalid";
    default:
      return "unknown";
  }
}
