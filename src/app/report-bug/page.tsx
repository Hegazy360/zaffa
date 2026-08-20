import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/marketing/legal-page";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Report a bug",
  description:
    "Found something broken on Zaffa? Send us the details and we'll take a look.",
  // Bug-report page should never appear in search results, it's an
  // operational surface for existing users, not a marketing page.
  robots: { index: false, follow: false },
};

export default async function ReportBugPage() {
  const t = await getTranslations("legal.reportBug");
  return (
    <LegalPage
      eyebrow={t("eyebrow")}
      title={t("title")}
      updated={t("subtitle")}
    >
      <p>{t("intro")}</p>

      <ContactForm kind="bug_report" />

      <h2 className="!mt-12">{t("diagnosticsTitle")}</h2>
      <p>{t("diagnosticsBody")}</p>
    </LegalPage>
  );
}
