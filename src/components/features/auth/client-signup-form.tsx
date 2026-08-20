"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { ttTrack, TIKTOK_EVENTS } from "@/lib/tiktok";
import { OAuthButtons } from "./oauth-buttons";
import { PasswordField } from "./password-field";
import { AuthCheckEmail } from "./auth-check-email";

const MIN_PASSWORD_LENGTH = 6;

// Only same-origin redirects survive the funnel; anything else falls back
// to /dashboard so a tampered `?next=https://evil` can't be used as an
// open redirect after sign-up confirmation.
function sanitizeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  return raw;
}

// Default sign-up surface for couples / clients planning an event. Role is
// hard-coded to "client", professional planners and vendors live on a
// dedicated route (/auth/signup/professional) so the headline and copy can
// speak directly to them without a generic role-picker step in the middle.
export function ClientSignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const t = useTranslations("auth");
  // Best-effort: link any matching Prospect row (warm lead) to this account.
  const claimProspect = trpc.profile.claimProspect.useMutation();
  // See the `user_already_exists` branch in handleSubmit below.
  const releaseStaleEmail = trpc.auth.releaseStaleEmail.useMutation();

  const nextPath = sanitizeNext(searchParams.get("next"));

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // When the caller is currently an anonymous Supabase user (e.g. they
  // came in through the venue designer's free-render flow), we upgrade
  // their existing session in-place via `updateUser({ email, password })`
  // so their saved designs + free render history transfer to the new
  // permanent identity. Falling back to `signUp` would create a fresh
  // user and orphan their data.
  const [isAnon, setIsAnon] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Force a session refresh before reading claims. `getClaims()` only
    // decodes the locally cached access-token JWT, which Supabase
    // doesn't always rotate after an anon→permanent `updateUser`. If
    // the user just upgraded (e.g. via the EmailGateOverlay or a prior
    // submit on this form) the cached token can still claim
    // `is_anonymous: true`, dragging us back into the anon-upgrade
    // branch and producing confusing errors like "same password" when
    // we try to `updateUser` a user who is already permanent.
    void supabase.auth
      .refreshSession()
      .catch(() => undefined)
      .then(() => supabase.auth.getClaims())
      .then(({ data }) => {
        if (!mounted) return;
        const claims = data?.claims as { is_anonymous?: boolean } | undefined;
        setIsAnon(claims?.is_anonymous === true);
      });
    return () => {
      mounted = false;
    };
  }, [supabase]);

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Where Supabase should land the user after they verify the email.
    // We aim them at the same `next` the page was opened with, so the
    // confirm-link round trip ends on /checkout (or wherever the caller
    // wanted) instead of the generic dashboard.
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const emailRedirectTo = `${origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`;

    let result = isAnon
      ? await supabase.auth.updateUser(
          { email, password, data: { full_name: fullName } },
          { emailRedirectTo },
        )
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role: "client" },
            emailRedirectTo,
          },
        });

    if (result.error) {
      // Idempotency net for stale-cache races: if our cached
      // `isAnon` told us to call `updateUser` but the user is already
      // permanent and already has this exact email + password set,
      // Supabase rejects with `same_password`. From the visitor's POV
      // they're already signed up with these credentials, refresh
      // the session and send them on instead of dead-ending them with
      // a "New password should be different from the old password"
      // error they can't reasonably resolve.
      const errCode = (
        result.error as { code?: string; message: string }
      ).code;
      if (isAnon && errCode === "same_password") {
        await supabase.auth.refreshSession().catch(() => undefined);
        claimProspect.mutate(undefined, {
          onError: () => {
            /* swallow: best-effort lead linking */
          },
        });
        router.push(nextPath);
        router.refresh();
        return;
      }

      // `user_already_exists` doesn't always mean "you have an
      // account", it also fires when the email is still parked on an
      // abandoned anonymous session from a previous free-render
      // attempt that never confirmed. Try to reclaim it and retry once
      // before dead-ending the visitor with a confusing error.
      if (!isAnon && errCode === "user_already_exists") {
        const release = await releaseStaleEmail
          .mutateAsync({ email })
          .catch(() => null);
        if (release?.released) {
          result = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: fullName, role: "client" },
              emailRedirectTo,
            },
          });
        }
      }

      if (result.error) {
        setError(result.error.message);
        setLoading(false);
        return;
      }
    }

    track(ANALYTICS_EVENTS.AUTH_SIGNED_UP, {
      role: "client",
      via: isAnon ? "anon_upgrade" : "email_password",
    });
    // TikTok activation funnel, `CompleteRegistration` is the
    // standard event TikTok Ads Manager surfaces for Lead / Sign-up
    // optimization objectives. Without firing a standard event here
    // TikTok shows "Custom events and page view events cannot be
    // used as optimization events" when the advertiser tries to
    // build a campaign around signups. Fires regardless of whether
    // the email-confirmation step is on or off, the user has
    // submitted valid credentials, which matches TikTok's
    // definition of the event.
    ttTrack(TIKTOK_EVENTS.COMPLETE_REGISTRATION, {
      description: isAnon ? "anon_upgrade" : "email_password",
    });

    // The anon-upgrade path keeps the same user row; only the role and
    // full_name need a refresh on the existing profile.
    const userId = result.data.user?.id;
    if (userId) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: "client", full_name: fullName })
        .eq("id", userId);

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
    }

    // Both code paths above are gated by Supabase's "Confirm email"
    // setting:
    //   - Confirm email OFF → `signUp` returns a session, and an
    //     `updateUser` from an anon user flips `is_anonymous` to false
    //     in place. We can send the visitor straight to `nextPath`.
    //   - Confirm email ON  → no session yet (signUp) / still
    //     anonymous (updateUser); we drop into the "check your email"
    //     branch and wait for the link to land on /auth/confirm.
    let canProceed = false;
    if (isAnon) {
      // Server-authoritative check. Supabase doesn't always rotate the
      // local access-token JWT immediately after a successful
      // anon→permanent `updateUser`, so `getClaims()` can still report
      // `is_anonymous: true` for a beat even though the user record on
      // the server is already permanent. That stale claim used to dump
      // us into the "check your inbox" branch even with Confirm email
      // OFF. Trust `result.data.user.is_anonymous` instead, it comes
      // straight from the response, and force a session refresh so
      // downstream middleware + tRPC calls see the new claims.
      const upgraded = result.data.user?.is_anonymous === false;
      canProceed = upgraded;
      if (upgraded) {
        await supabase.auth.refreshSession().catch(() => undefined);
      }
    } else {
      canProceed = Boolean(
        "session" in result.data ? result.data.session : null,
      );
    }

    if (canProceed) {
      claimProspect.mutate(undefined, {
        onError: () => {
          /* swallow: best-effort lead linking */
        },
      });
      router.push(nextPath);
      router.refresh();
      return;
    }

    setLoading(false);
    setSuccess(true);
  };

  if (success) {
    return <AuthCheckEmail email={email} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">{t("fullName")}</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Jane Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            disabled={loading}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={loading}
            className="h-11"
          />
        </div>
        <PasswordField
          id="password"
          label={t("password")}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          disabled={loading}
          showStrength
          show={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          placeholder={t("passwordHint")}
        />
      </div>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={!canSubmit || loading}
        className="group h-11 w-full gap-2 bg-brand-gradient text-white shadow-glow transition-all hover:opacity-90 hover:shadow-glow-lg"
      >
        {loading ? t("creatingAccount") : t("createAccount")}
        {!loading && (
          <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
        )}
      </Button>

      <div className="relative py-1">
        <div
          aria-hidden
          className="champagne-hairline absolute inset-x-0 top-1/2 h-px"
        />
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-eyebrow text-muted-foreground">
            {t("orContinueWith")}
          </span>
        </div>
      </div>

      <OAuthButtons />

      <p className="text-center text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link
          href={
            nextPath === "/dashboard"
              ? "/auth/signin"
              : `/auth/signin?next=${encodeURIComponent(nextPath)}`
          }
          className="font-medium text-rose-700 underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}
