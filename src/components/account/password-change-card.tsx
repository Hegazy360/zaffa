"use client";

import { useState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PasswordChangeCardProps {
  email: string | null;
}

/**
 * In-app password change. We re-verify the current password by signing in
 * silently with it, then call `updateUser` to set the new one. This
 * avoids needing a custom server endpoint to validate the current
 * password (Supabase doesn't expose one).
 *
 * Notes:
 *  - Users who signed up via OAuth (no password set) won't have a current
 *    password. We surface the appropriate message in that case.
 *  - On success the existing session keeps working (Supabase auto-rotates
 *    the refresh token).
 */
export function PasswordChangeCard({ email }: PasswordChangeCardProps) {
  const t = useTranslations("account");
  const supabase = createClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toast.error(t("noEmail"));
      return;
    }
    if (next.length < 8) {
      toast.error(t("passwordTooShort"));
      return;
    }
    if (next !== confirm) {
      toast.error(t("passwordsDontMatch"));
      return;
    }
    setBusy(true);
    try {
      // Re-verify the current password. signInWithPassword on an active
      // session refreshes the JWT for the same user; if the password is
      // wrong it returns an error without disturbing the session.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (verifyError) {
        toast.error(t("currentPasswordWrong"));
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: next,
      });
      if (updateError) {
        toast.error(updateError.message);
        return;
      }
      toast.success(t("passwordUpdated"));
      setCurrent("");
      setNext("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-rose-100/70 bg-white/70 p-4 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/70"
    >
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="size-4 text-rose-700" aria-hidden />
        <p className="text-sm font-medium">{t("changePassword")}</p>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("changePasswordHint")}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="current-password" className="text-xs">
            {t("currentPassword")}
          </Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password" className="text-xs">
            {t("newPassword")}
          </Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password" className="text-xs">
            {t("confirmNewPassword")}
          </Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={busy}
          className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t("savePassword")}
        </Button>
      </div>
    </form>
  );
}
