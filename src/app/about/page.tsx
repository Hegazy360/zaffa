import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "About",
  description:
    "Zaffa is a curated event-planning platform - connecting couples with vetted planners and vendors.",
};

export default async function AboutPage() {
  const t = await getTranslations("legal.about");
  return (
    <LegalPage
      eyebrow={t("eyebrow")}
      title={t("title")}
      updated={t("subtitle")}
    >
      <p>{t("p1")}</p>
      <p>{t("p2")}</p>
      <p>{t("p3")}</p>
    </LegalPage>
  );
}
