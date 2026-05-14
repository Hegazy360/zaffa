"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Lock, Mail, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "@/components/security/Turnstile";
import { ttTrack, TIKTOK_EVENTS } from "@/lib/tiktok";

interface EmailGateOverlayProps {
  /**
   * Cloudinary-watermarked render URL — shown blurred behind the gate
   * card so the visitor sees there's actually a result waiting.
   */
  watermarkedImageUrl: string;
  /**
   * Optional ids for stitching the email capture event to the original
   * design + render rows. Passed to the magic-link redirect target so
   * `/r/{renderId}` shows the right preview after confirmation.
   */
  renderId: string | null;
  designId: string | null;
  /**
   * Called when the visitor explicitly dismisses the success state to
   * try a different email. The parent component re-mounts the gate by
   * resetting its own state.
   */
  onTryDifferentEmail?: () => void;
}

type Stage = "form" | "submitting" | "sent" | "already_used" | "error";

/**
 * Email gate shown right after a free-tier render completes. Single
 * field — email only. On submit:
 *   1. Server-side: `auth.requestEmailUpgrade` locks the email globally,
 *      records the capture, and pushes to Resend Audiences.
 *   2. Client-side: `supabase.auth.updateUser({ email })` sends the
 *      Supabase confirmation email with the magic link.
 *
 * The visitor stays on this page (overlay stays mounted) until they
 * click the link in their inbox, which redirects them to
 * `/r/{renderId}` with a permanent session.
 */
export function EmailGateOverlay({
  watermarkedImageUrl,
  renderId,
  designId,
  onTryDifferentEmail,
}: EmailGateOverlayProps) {
  const t = useTranslations("emailGate");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const requestUpgrade = trpc.auth.requestEmailUpgrade.useMutation();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) return;
      setStage("submitting");

      try {
        await requestUpgrade.mutateAsync({
          email: trimmed,
          designId: designId ?? undefined,
          renderId: renderId ?? undefined,
          turnstileToken: turnstileToken ?? undefined,
        });
        // TikTok lead funnel — fire `SubmitForm` the moment the
        // server-side capture lands (lock acquired + Resend Audience
        // push queued). This is the canonical "lead captured"
        // moment in the funnel; the subsequent Supabase upgrade is
        // the registration completion. Using `renderId` as the
        // event_id lets a future server-side mirror dedupe.
        ttTrack(
          TIKTOK_EVENTS.SUBMIT_FORM,
          { description: "email_gate" },
          renderId ?? undefined,
        );
      } catch (err) {
        // Single-use Turnstile tokens — reset for the next attempt.
        setTurnstileToken(null);
        setTurnstileResetKey((k) => k + 1);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("EMAIL_ALREADY_USED_FREE")) {
          setStage("already_used");
          return;
        }
        if (message.includes("TURNSTILE_FAILED")) {
          setStage("form");
          toast.error(t("genericErrorTitle"));
          return;
        }
        if (message.includes("TOO_MANY_REQUESTS") || message.includes("Too many")) {
          setStage("error");
          toast.error(t("rateLimitedTitle"));
          return;
        }
        setStage("error");
        toast.error(t("genericErrorTitle"));
        return;
      }

      // Server-side lock + Resend Audience push succeeded. Now upgrade
      // the anonymous user in Supabase. Two branches downstream:
      //   - "Confirm email" ON  → Supabase sends a confirmation email
      //     with a magic link. The user stays `is_anonymous: true` and
      //     we show the "check your inbox" success state.
      //   - "Confirm email" OFF → Supabase immediately flips the user
      //     to permanent (`is_anonymous: false`), no email goes out.
      //     We can't pretend we sent one in that case, so we redirect
      //     directly to the reveal page where the upgraded session
      //     unlocks `getRenderById` and the upsell.
      const supabase = createClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const nextPath = renderId ? `/r/${renderId}` : "/venue-designer";
      const { data, error: supabaseError } = await supabase.auth.updateUser(
        { email: trimmed },
        { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(nextPath)}` },
      );
      if (supabaseError) {
        // The lock + capture event already landed, but Supabase
        // couldn't dispatch the email. Surface a retry but don't
        // un-claim the lock — the reconcile cron handles cleanup.
        setStage("error");
        toast.error(supabaseError.message || t("genericErrorTitle"));
        return;
      }

      // "Confirm email" disabled in the Supabase project: the user is
      // already permanent. Skip the inbox-check ceremony and reveal
      // the (still watermarked, free-tier) render directly.
      if (data?.user && data.user.is_anonymous === false) {
        // TikTok activation funnel — only fire `CompleteRegistration`
        // when the user is actually permanent. With Confirm-email
        // ON the upgrade only resolves after they click the magic
        // link, so we leave the event unfired in that branch and
        // rely on the in-app signup forms to fire it on
        // permanent-account creation.
        ttTrack(
          TIKTOK_EVENTS.COMPLETE_REGISTRATION,
          { description: "email_gate" },
          data.user.id,
        );
        router.push(nextPath);
        router.refresh();
        return;
      }

      setSubmittedEmail(trimmed);
      setStage("sent");
    },
    [email, requestUpgrade, designId, renderId, router, t, turnstileToken],
  );

  const handleReset = useCallback(() => {
    setStage("form");
    setEmail("");
    setSubmittedEmail("");
    onTryDifferentEmail?.();
  }, [onTryDifferentEmail]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-rose-200/70 bg-card shadow-xl">
      {/* Blurred preview backdrop — fills whatever final height the
          container ends up at. The form below determines that height,
          so the card is never clipped on short viewports. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${watermarkedImageUrl})` }}
        aria-hidden
      >
        <div className="absolute inset-0 scale-105 backdrop-blur-lg" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-black/65" />
      </div>

      <div className="relative grid min-h-[min(60vh,420px)] place-items-center p-6 sm:p-10">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-background/95 p-7 shadow-2xl backdrop-blur-sm sm:p-9">
          {stage === "sent" ? (
            <SentState
              email={submittedEmail}
              onTryDifferent={handleReset}
            />
          ) : stage === "already_used" ? (
            <AlreadyUsedState onTryDifferent={handleReset} />
          ) : (
            <FormState
              email={email}
              setEmail={setEmail}
              onSubmit={handleSubmit}
              submitting={stage === "submitting"}
              turnstileResetKey={turnstileResetKey}
              onTurnstileToken={setTurnstileToken}
            />
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 end-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-[10px] font-medium tracking-wide text-white backdrop-blur">
        <Lock className="size-3" />
        {t("watermarkBadge")}
      </div>
    </div>
  );
}

function FormState({
  email,
  setEmail,
  onSubmit,
  submitting,
  turnstileResetKey,
  onTurnstileToken,
}: {
  email: string;
  setEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  turnstileResetKey: number;
  onTurnstileToken: (token: string | null) => void;
}) {
  const t = useTranslations("emailGate");
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-rose-50 px-2.5 py-1 text-[10px] font-medium tracking-[0.18em] text-rose-700 uppercase dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          <Sparkles className="size-3" />
          {t("eyebrow")}
        </div>
        <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("body")}
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="email-gate-input"
          className="text-xs font-medium text-muted-foreground"
        >
          {t("emailLabel")}
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="email-gate-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            disabled={submitting}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            className="block w-full rounded-lg border border-input bg-background ps-9 pe-3 py-2.5 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          />
        </div>
      </div>

      <div className="flex justify-center">
        <Turnstile
          onToken={onTurnstileToken}
          resetKey={turnstileResetKey}
        />
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={submitting}
        className="w-full gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-500/20 hover:opacity-90"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("submitting")}
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            {t("submit")}
          </>
        )}
      </Button>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("privacy")}
      </p>
    </form>
  );
}

function SentState({
  email,
  onTryDifferent,
}: {
  email: string;
  onTryDifferent: () => void;
}) {
  const t = useTranslations("emailGate");
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60 dark:from-rose-950/50 dark:to-amber-950/30 dark:ring-rose-900/40">
        <CheckCircle2 className="size-6 text-rose-600 dark:text-rose-300" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-display text-2xl font-light tracking-tight">
          {t("successTitle")}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("successBody", { email })}
        </p>
        <p className="text-xs text-muted-foreground">{t("successHint")}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onTryDifferent}
        className="text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:hover:bg-rose-950/40"
      >
        {t("skipForNow")}
      </Button>
    </div>
  );
}

function AlreadyUsedState({
  onTryDifferent,
}: {
  onTryDifferent: () => void;
}) {
  const t = useTranslations("emailGate");
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-100 ring-1 ring-amber-300/60 dark:bg-amber-950/40 dark:ring-amber-800/50">
        <Lock className="size-6 text-amber-700 dark:text-amber-300" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-display text-2xl font-light tracking-tight">
          {t("alreadyUsedTitle")}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("alreadyUsedBody")}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onTryDifferent}
      >
        {t("tryAgain")}
      </Button>
    </div>
  );
}
