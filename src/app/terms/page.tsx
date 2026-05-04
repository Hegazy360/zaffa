import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of Zaffa, including planner and vendor responsibilities, payments, refunds, and disputes.",
};

export default async function TermsPage() {
  const t = await getTranslations("legal.terms");
  return (
    <LegalPage
      eyebrow={t("eyebrow")}
      title={t("title")}
      updated={t("updated", { date: "May 2026" })}
    >
      <p>{t("intro")}</p>

      <h2>{t("h_definitions")}</h2>
      <p>{t("definitions")}</p>

      <h2>{t("h_accounts")}</h2>
      <p>{t("accounts")}</p>

      <h2>{t("h_marketplace")}</h2>
      <p>{t("marketplace")}</p>

      <h2>{t("h_professional_obligations")}</h2>
      <p>{t("professional_obligations")}</p>

      <h2>{t("h_payments")}</h2>
      <p>{t("payments")}</p>

      <h2>{t("h_refunds")}</h2>
      <p>{t("refunds")}</p>

      <h2>{t("h_disputes")}</h2>
      <p>{t("disputes")}</p>

      <h2>{t("h_content")}</h2>
      <p>{t("content")}</p>

      <h2>{t("h_ai_outputs")}</h2>
      <p>{t("ai_outputs")}</p>

      <h2>{t("h_acceptable_use")}</h2>
      <p>{t("acceptable_use")}</p>

      <h2>{t("h_termination")}</h2>
      <p>{t("termination")}</p>

      <h2>{t("h_third_party")}</h2>
      <p>{t("third_party")}</p>

      <h2>{t("h_warranty")}</h2>
      <p>{t("warranty")}</p>

      <h2>{t("h_liability")}</h2>
      <p>{t("liability")}</p>

      <h2>{t("h_indemnity")}</h2>
      <p>{t("indemnity")}</p>

      <h2>{t("h_changes")}</h2>
      <p>{t("changes")}</p>

      <h2>{t("h_law")}</h2>
      <p>{t("law")}</p>

      <h2>{t("h_misc")}</h2>
      <p>{t("misc")}</p>

      <h2>{t("h_contact")}</h2>
      <p>{t("contact")}</p>
    </LegalPage>
  );
}
