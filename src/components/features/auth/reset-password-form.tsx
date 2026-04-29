"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "checking" | "ready" | "invalid";

const MIN_PASSWORD_LENGTH = 6;

export function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
        if (event === "PASSWORD_RECOVERY" || (event === "INITIAL_SESSION" && session)) {
          setStatus("ready");
        }
      }
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
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
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
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-8 text-primary" aria-hidden />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Password updated</h3>
          <p className="text-sm text-muted-foreground">
            Your password has been changed. Redirecting you to sign in…
          </p>
        </div>
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        Verifying your reset link…
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          This password reset link is invalid or has expired. Please request a
          new one.
        </div>
        <Button
          render={<Link href="/auth/forgot-password" />}
          className="w-full"
        >
          Request a new link
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/auth/signin"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            disabled={loading}
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            disabled={loading}
            className="h-10"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Updating password…" : "Update password"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/auth/signin"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
