import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import {
  authErrorReasonKey,
  type AuthErrorReason,
} from "@/components/features/auth/auth-errors";

export const metadata = {
  title: "Sign-in link interrupted",
  description: "Something interrupted that link. Try again or request a new one.",
};

interface PageProps {
  searchParams: Promise<{ reason?: string }>;
}

// `expired` and `missing_token` both came from an email link that no longer
// works, so the next step is "request a fresh link". The remaining reasons
// are best resolved by re-attempting sign-in directly.
function suggestNewLink(reason: AuthErrorReason): boolean {
  return reason === "expired" || reason === "missing_token";
}

export default async function AuthErrorPage({ searchParams }: PageProps) {
  const t = await getTranslations("auth");
  const { reason } = await searchParams;
  const safeReason = (reason ?? "unknown") as AuthErrorReason;
  const key = authErrorReasonKey(safeReason);
  const ctaNewLink = suggestNewLink(safeReason);

  return (
    <div className="space-y-8">
      <div className="space-y-3 text-center">
        <div className="flex justify-center">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 -m-2 rounded-full bg-gradient-to-br from-rose-500/30 to-amber-500/30 blur-xl"
            />
            <div className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/30 ring-1 ring-white/40">
              <ShieldAlert className="size-9" aria-hidden />
            </div>
          </div>
        </div>
        <h1 className="font-display text-balance text-3xl font-light tracking-tight sm:text-4xl">
          {t("errorPageTitle")}
        </h1>
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          {t(`errors.${key}`)}
        </p>
      </div>

      <div aria-hidden className="champagne-hairline mx-auto h-px w-2/3" />

      <div className="space-y-3">
        {ctaNewLink ? (
          <>
            <Button
              render={<Link href="/auth/forgot-password" />}
              size="lg"
              className="group h-11 w-full gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90 hover:shadow-rose-600/30"
            >
              {t("errorPageRequestNew")}
              <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Button>
            <Button
              render={<Link href="/auth/signin" />}
              variant="outline"
              size="lg"
              className="h-11 w-full"
            >
              {t("backToSignIn")}
            </Button>
          </>
        ) : (
          <>
            <Button
              render={<Link href="/auth/signin" />}
              size="lg"
              className="group h-11 w-full gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90 hover:shadow-rose-600/30"
            >
              {t("errorPageTryAgain")}
              <ArrowRight className="size-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Button>
            <Button
              render={<Link href="/auth/forgot-password" />}
              variant="outline"
              size="lg"
              className="h-11 w-full"
            >
              {t("errorPageRequestNew")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
