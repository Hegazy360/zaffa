"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordField } from "./password-field";

type Status = "checking" | "ready" | "invalid";

const MIN_PASSWORD_LENGTH = 6;

export function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations("auth");
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // The Supabase client auto-detects tokens in the URL hash and emits a
    // PASSWORD_RECOVERY event when a recovery link is processed. We also
    // accept any pre-existing session so a refresh on this page still works.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        if (
          event === "PASSWORD_RECOVERY" ||
          (event === "INITIAL_SESSION" && session)
        ) {
          setStatus("ready");
        }
      },
    );

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        setStatus("ready");
        return;
      }
      // Give the SDK a brief moment to process the URL hash before declaring
      // the link invalid.
      setTimeout(() => {
        if (cancelled) return;
        setStatus((prev) => (prev === "checking" ? "invalid" : prev));
      }, 1500);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("resetMinLength", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordsNoMatch"));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    // Sign the recovery session out so the user explicitly signs in with
    // their new password.
    await supabase.auth.signOut();

    setTimeout(() => {
      router.push("/auth/signin");
      router.refresh();
    }, 1500);
  };

  if (success) {
    return (
      <div className="space-y-7 text-center">
        <div className="flex justify-center">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 -m-2 rounded-full bg-gradient-to-br from-rose-500/30 to-amber-500/30 blur-xl"
            />
            <div className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-glow ring-1 ring-white/40">
              <CheckCircle2 className="size-9" aria-hidden />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="font-display text-3xl font-light tracking-tight">
            {t("resetUpdated")}
          </h2>
          <p className="text-pretty text-sm text-muted-foreground sm:text-base">
            {t("resetUpdatedHint")}
          </p>
        </div>
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-sm text-muted-foreground">
        <div className="size-9 animate-spin rounded-full border-2 border-muted border-t-rose-500" />
        {t("resetCheckingLink")}
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="space-y-5">
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t("resetLinkInvalid")}
        </div>
        <Button
          render={<Link href="/auth/forgot-password" />}
          size="lg"
          className="group h-11 w-full gap-2 bg-brand-gradient text-white shadow-glow transition-all hover:opacity-90 hover:shadow-glow-lg"
        >
          {t("resetRequestNew")}
          <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/auth/signin"
            className="font-medium text-rose-700 underline-offset-4 hover:underline dark:text-rose-300"
          >
            {t("backToSignIn")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <PasswordField
          id="password"
          label={t("resetNewPassword")}
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
        <PasswordField
          id="confirmPassword"
          label={t("resetConfirmNewPassword")}
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          disabled={loading}
          show={showConfirmPassword}
          onToggleShow={() => setShowConfirmPassword((v) => !v)}
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
        disabled={loading}
        className="group h-11 w-full gap-2 bg-brand-gradient text-white shadow-glow transition-all hover:opacity-90 hover:shadow-glow-lg"
      >
        {loading ? t("resetUpdatingPassword") : t("resetUpdatePassword")}
        {!loading && (
          <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/auth/signin"
          className="font-medium text-rose-700 underline-offset-4 hover:underline dark:text-rose-300"
        >
          {t("backToSignIn")}
        </Link>
      </p>
    </form>
  );
}
