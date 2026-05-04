import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Zaffa collects, uses, and protects your information when you plan an event with us.",
};

export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");
  return (
    <LegalPage
      eyebrow={t("eyebrow")}
      title={t("title")}
      updated={t("updated", { date: "May 2026" })}
    >
      <p>{t("intro")}</p>

      <h2>{t("h_controller")}</h2>
      <p>{t("controller")}</p>

      <h2>{t("h_collect")}</h2>
      <p>{t("collect")}</p>
      <ul>
        <li>{t("collect_item_account")}</li>
        <li>{t("collect_item_event")}</li>
        <li>{t("collect_item_payments")}</li>
        <li>{t("collect_item_messages")}</li>
        <li>{t("collect_item_usage")}</li>
        <li>{t("collect_item_cookies")}</li>
      </ul>

      <h2>{t("h_use")}</h2>
      <p>{t("use")}</p>
      <ul>
        <li>{t("use_item_match")}</li>
        <li>{t("use_item_payments")}</li>
        <li>{t("use_item_safety")}</li>
        <li>{t("use_item_emails")}</li>
        <li>{t("use_item_analytics")}</li>
      </ul>

      <h2>{t("h_ai")}</h2>
      <p>{t("ai")}</p>

      <h2>{t("h_share")}</h2>
      <p>{t("share")}</p>
      <ul>
        <li>{t("share_item_processors")}</li>
        <li>{t("share_item_other_users")}</li>
        <li>{t("share_item_legal")}</li>
        <li>{t("share_item_business")}</li>
      </ul>
      <p>{t("share_no_sale")}</p>

      <h2>{t("h_transfers")}</h2>
      <p>{t("transfers")}</p>

      <h2>{t("h_retention")}</h2>
      <p>{t("retention")}</p>

      <h2>{t("h_security")}</h2>
      <p>{t("security")}</p>

      <h2>{t("h_rights")}</h2>
      <p>{t("rights")}</p>

      <h2>{t("h_children")}</h2>
      <p>{t("children")}</p>

      <h2>{t("h_changes")}</h2>
      <p>{t("changes")}</p>

      <h2>{t("h_contact")}</h2>
      <p>{t("contact")}</p>
    </LegalPage>
  );
}
