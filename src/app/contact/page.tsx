import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Mail, MessageCircle, MapPin } from "lucide-react";
import { LegalPage } from "@/components/marketing/legal-page";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Zaffa team — support, partnerships, press.",
};

export default async function ContactPage() {
  const t = await getTranslations("legal.contact");
  return (
    <LegalPage
      eyebrow={t("eyebrow")}
      title={t("title")}
      updated={t("subtitle")}
    >
      <p>{t("intro")}</p>

      <h2 className="!mt-10">{t("formTitle")}</h2>
      <ContactForm kind="contact" />

      <h2 className="!mt-12">{t("channelsTitle")}</h2>
      <ul className="not-prose mt-4 grid gap-3 sm:grid-cols-2">
        <li className="flex items-start gap-3 rounded-2xl border border-rose-100/70 bg-white/80 p-4">
          <Mail className="mt-0.5 size-5 text-rose-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              {t("supportLabel")}
            </p>
            <a
              href="mailto:hello@zaffa.ai"
              className="mt-1 block break-all font-mono text-sm hover:underline"
            >
              hello@zaffa.ai
            </a>
          </div>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-rose-100/70 bg-white/80 p-4">
          <MessageCircle className="mt-0.5 size-5 text-rose-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              {t("partnershipsLabel")}
            </p>
            <a
              href="mailto:partners@zaffa.ai"
              className="mt-1 block break-all font-mono text-sm hover:underline"
            >
              partners@zaffa.ai
            </a>
          </div>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-rose-100/70 bg-white/80 p-4 sm:col-span-2">
          <MapPin className="mt-0.5 size-5 text-rose-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              {t("locationLabel")}
            </p>
            <p className="mt-1 text-sm">{t("location")}</p>
          </div>
        </li>
      </ul>
    </LegalPage>
  );
}
