import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/features/auth/reset-password-form";

export const metadata = {
  title: "Reset Your Password",
  description: "Choose a new password for your Zaffa account",
};

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-rose-700 backdrop-blur-sm">
          <Sparkles className="size-3" />
          {t("resetEyebrow")}
        </div>
        <h1 className="font-display text-balance text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl">
          {t("resetHeadlinePart1")}{" "}
          <span className="italic">{t("resetHeadlineItalic")}</span>{" "}
          <span className="text-brand-gradient">
            {t("resetHeadlineHighlight")}
          </span>
        </h1>
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          {t("resetSubtitle")}
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
