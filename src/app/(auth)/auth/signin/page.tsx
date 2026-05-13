import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/components/features/auth/signin-form";
import {
  authErrorReasonKey,
  type AuthErrorReason,
} from "@/components/features/auth/auth-errors";

export const metadata = {
  title: "Sign In to Zaffa",
  description: "Sign in to your Zaffa account",
};

interface PageProps {
  searchParams: Promise<{ error?: string; reason?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const t = await getTranslations("auth");
  const { error, reason } = await searchParams;
  const initialError = error
    ? decodeURIComponent(error)
    : reason
      ? t(`errors.${authErrorReasonKey(reason as AuthErrorReason)}`)
      : null;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-rose-700 backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          <Sparkles className="size-3" />
          {t("signInEyebrow")}
        </div>
        <h1 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl">
          {t("signInHeadlinePart1")}{" "}
          <span className="italic">{t("signInHeadlineItalic")}</span>{" "}
          <span className="bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 bg-clip-text text-transparent">
            {t("signInHeadlineHighlight")}
          </span>
        </h1>
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          {t("signInSubtitle")}
        </p>
      </div>

      <Suspense fallback={null}>
        <SignInForm initialError={initialError} />
      </Suspense>
    </div>
  );
}
