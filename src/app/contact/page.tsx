import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Mail, MessageCircle, MapPin } from "lucide-react";
import { LegalPage } from "@/components/marketing/legal-page";
import { ContactForm } from "@/components/marketing/contact-form";
import {
  WHATSAPP_LINK,
  WHATSAPP_NUMBER_DISPLAY,
} from "@/lib/contact-channels";

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
          {/* Brand-coloured WhatsApp glyph kept inline for the same
              reason as in the footer — single consumer, no need for an
              icon-library entry. */}
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="mt-0.5 size-5 text-emerald-600"
            fill="currentColor"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Zm-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.83 9.83 0 0 1 6.991 2.898 9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884Zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488Z" />
          </svg>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700/80">
              {t("whatsappLabel")}
            </p>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block font-mono text-sm hover:underline"
            >
              {WHATSAPP_NUMBER_DISPLAY}
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
