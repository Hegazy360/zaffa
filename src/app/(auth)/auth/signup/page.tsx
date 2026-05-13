import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ClientSignUpForm } from "@/components/features/auth/client-signup-form";

export const metadata = {
  title: "Create Your Zaffa Account",
  description: "Sign up for a Zaffa account to get started",
};

export default async function SignUpPage() {
  const t = await getTranslations("auth");
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-rose-700 backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          <Sparkles className="size-3" />
          {t("signUpEyebrow")}
        </div>
        <h1 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl">
          {t("signUpHeadlinePart1")}{" "}
          <span className="italic">{t("signUpHeadlineItalic")}</span>{" "}
          <span className="bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 bg-clip-text text-transparent">
            {t("signUpHeadlineHighlight")}
          </span>
        </h1>
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          {t("signUpSubtitle")}
        </p>
      </div>

      <Suspense fallback={null}>
        <ClientSignUpForm />
      </Suspense>

      {/* Quiet detour for planners and vendors. We deliberately keep it muted
          so the client journey stays the obvious default. */}
      <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-4 text-sm backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/60">
        <p className="text-muted-foreground">
          {t("areYouProfessional")}{" "}
          <Link
            href="/auth/signup/professional"
            className="group inline-flex items-center gap-1 font-medium text-rose-700 underline-offset-4 hover:underline dark:text-rose-300"
          >
            {t("areYouProfessionalCta")}
            <ArrowRight className="size-3.5 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </p>
      </div>
    </div>
  );
}
