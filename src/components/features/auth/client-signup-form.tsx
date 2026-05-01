"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { OAuthButtons } from "./oauth-buttons";
import { PasswordField } from "./password-field";
import { AuthCheckEmail } from "./auth-check-email";

const MIN_PASSWORD_LENGTH = 6;

// Default sign-up surface for couples / clients planning an event. Role is
// hard-coded to "client" — professional planners and vendors live on a
// dedicated route (/auth/signup/professional) so the headline and copy can
// speak directly to them without a generic role-picker step in the middle.
export function ClientSignUpForm() {
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations("auth");
  // Best-effort: link any matching Prospect row (warm lead) to this account.
  const claimProspect = trpc.profile.claimProspect.useMutation();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: "client" },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: "client", full_name: fullName })
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
        className="group h-11 w-full gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90 hover:shadow-rose-600/30"
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
          <span className="bg-background px-3 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
            {t("orContinueWith")}
          </span>
        </div>
      </div>

      <OAuthButtons />

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
