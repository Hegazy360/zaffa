"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleSelector } from "./role-selector";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const STEPS = 2;

export function SignUpForm() {
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const canProceedStep1 =
    email.trim() && password.length >= 6 && fullName.trim();
  const canSubmitStep2 = role !== null;

  const handleNext = () => {
    setError(null);
    if (step < STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
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
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setLoading(false);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-8 text-primary" aria-hidden />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">{t("checkEmailTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("checkEmailLong", { email })}
          </p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {t("hasAccount")}{" "}
          <Link
            href="/auth/signin"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signIn")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {step === 1 && (
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
              className="h-10"
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
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("passwordHint")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              disabled={loading}
              className="h-10"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-1 text-sm font-medium">{t("chooseYourRole")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("chooseRoleHint")}
            </p>
            <RoleSelector selectedRole={role} onSelect={setRole} />
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={loading}
            className="gap-2"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {tCommon("back")}
          </Button>
        ) : (
          <div />
        )}
        {step < STEPS ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canProceedStep1 || loading}
            className="ms-auto gap-2"
          >
            {tCommon("next")}
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={!canSubmitStep2 || loading}
            className="ms-auto w-full"
          >
            {loading ? t("creatingAccount") : t("createAccount")}
          </Button>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link
          href="/auth/signin"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}
