"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

interface AuthCheckEmailProps {
  email: string;
  /** Optional override for the headline. Defaults to `auth.checkEmailTitle`. */
  title?: string;
  /** Optional override for the body. Defaults to `auth.checkEmailLong`. */
  body?: string;
}

// Branded "we sent you a link" success state, used by both signup paths and
// the forgot-password flow (with overridden copy). Mirrors the editorial card
// language from the marketing surfaces.
export function AuthCheckEmail({ email, title, body }: AuthCheckEmailProps) {
  const t = useTranslations("auth");

  return (
    <div className="space-y-7 text-center">
      <div className="flex justify-center">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -m-2 rounded-full bg-gradient-to-br from-rose-500/30 to-amber-500/30 blur-xl"
          />
          <div className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-glow ring-1 ring-white/40">
            <Mail className="size-9" aria-hidden />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-3xl font-light tracking-tight">
          {title ?? t("checkEmailTitle")}
        </h2>
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          {body ?? t("checkEmailLong", { email })}
        </p>
      </div>

      <div aria-hidden className="champagne-hairline mx-auto h-px w-2/3" />

      <p className="text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link
          href="/auth/signin"
          className="font-medium text-rose-700 underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
