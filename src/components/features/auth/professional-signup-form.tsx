"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import type { UserRole } from "@/types";
import { RoleSelector } from "./role-selector";
import { OAuthButtons } from "./oauth-buttons";
import { PasswordField } from "./password-field";
import { AuthCheckEmail } from "./auth-check-email";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 6;
type ProRole = Extract<UserRole, "planner" | "vendor">;

// Two-step sign-up tailored to professionals — planners and vendors.
// Step 1 surfaces the role choice up front so step 2 can speak directly to
// the chosen audience ("Welcome, planner — your atelier in one place.").
export function ProfessionalSignUpForm() {
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const claimProspect = trpc.profile.claimProspect.useMutation();

  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<ProRole | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const canProceedStep1 = role !== null;
  const canSubmitStep2 =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH;

  const handleNext = () => {
    setError(null);
    if (canProceedStep1) setStep(2);
  };

  const handleBack = () => {
    setError(null);
    setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;

    setError(null);
    setLoading(true);

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Activation funnel — fired client-side because this is the moment
    // the user perceives "I just signed up". The role-specific
    // `onboarding.completed` / `profile.published` events fire later
    // server-side when the wizard saves.
    track(ANALYTICS_EVENTS.AUTH_SIGNED_UP, {
      role,
      via: "email_password",
    });

    if (authData.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role, full_name: fullName })
        .eq("id", authData.user.id);

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
    }

    if (authData.session) {
      claimProspect.mutate(undefined, {
        onError: () => {
          /* swallow: best-effort lead linking */
        },
      });
      router.push("/dashboard");
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
      {/* Step indicator — minimal pair of capsules + an em-dash divider so
          progress is obvious without dominating the layout. */}
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            step === 1 ? "text-rose-700 dark:text-rose-300" : "",
          )}
        >
          <span
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
              step >= 1
                ? "bg-gradient-to-br from-rose-500 to-amber-500 text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            1
          </span>
          {t("stepRole")}
        </span>
        <span aria-hidden className="h-px w-6 bg-rose-200/70" />
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            step === 2 ? "text-rose-700 dark:text-rose-300" : "",
          )}
        >
          <span
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
              step >= 2
                ? "bg-gradient-to-br from-rose-500 to-amber-500 text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            2
          </span>
          {t("stepDetails")}
        </span>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-light tracking-tight">
              {t("chooseProRoleTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("chooseProRoleHint")}
            </p>
          </div>
          <RoleSelector
            roles={["planner", "vendor"]}
            selectedRole={role}
            onSelect={(r) => setRole(r as ProRole)}
          />
        </div>
      )}

      {step === 2 && role && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-rose-100/70 bg-gradient-to-br from-rose-50 via-white to-amber-50/60 p-4 dark:border-rose-900/30 dark:from-rose-950/40 dark:via-card dark:to-amber-950/30">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-rose-700/80 dark:text-rose-200/80">
              {role === "planner" ? t("plannerEyebrow") : t("vendorEyebrow")}
            </p>
            <p className="mt-1 font-display text-lg font-light tracking-tight">
              {role === "planner"
                ? t("plannerStep2Headline")
                : t("vendorStep2Headline")}
            </p>
          </div>

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
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        {step === 2 && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleBack}
            disabled={loading}
            className="h-11 gap-2"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {tCommon("back")}
          </Button>
        )}

        {step === 1 ? (
          <Button
            type="button"
            size="lg"
            onClick={handleNext}
            disabled={!canProceedStep1}
            className="group ms-auto h-11 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-6 text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90 hover:shadow-rose-600/30"
          >
            {tCommon("next")}
            <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmitStep2 || loading}
            className="group ms-auto h-11 flex-1 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90 hover:shadow-rose-600/30"
          >
            {loading ? t("creatingAccount") : t("createAccount")}
            {!loading && (
              <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            )}
          </Button>
        )}
      </div>

      {step === 1 && (
        <>
          <div className="relative py-1">
            <div
              aria-hidden
              className="champagne-hairline absolute inset-x-0 top-1/2 h-px"
            />
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                {t("orContinueWith")}
              </span>
            </div>
          </div>
          <OAuthButtons intendedRole={role} requireRole />
        </>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link
          href="/auth/signin"
          className="font-medium text-rose-700 underline-offset-4 hover:underline dark:text-rose-300"
        >
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}
