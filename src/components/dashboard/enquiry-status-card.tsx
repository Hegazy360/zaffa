"use client";

import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { WHATSAPP_LINK } from "@/lib/contact-channels";

/**
 * "We're on it" — the couple's view of a live enquiry.
 *
 * Between submitting the wizard and the first WhatsApp reply there is a silent
 * gap, and silence after handing over your wedding is exactly the anxiety this
 * product exists to remove. This closes it.
 *
 * Renders nothing once the enquiry has converted (an event exists, so the
 * package card takes over) or when it is closed.
 */

const STATUS_KEY: Record<string, string> = {
  new: "enquiryStatusNew",
  contacted: "enquiryStatusContacted",
  call_scheduled: "enquiryStatusCall",
  quote_sent: "enquiryStatusQuote",
  accepted: "enquiryStatusAccepted",
  deposit_paid: "enquiryStatusDeposit",
  in_planning: "enquiryStatusPlanning",
};

export function EnquiryStatusCard() {
  const t = useTranslations("concierge");
  const q = trpc.enquiries.mine.useQuery();

  const live = (q.data ?? []).find(
    (e) => !e.event_id && STATUS_KEY[e.status] !== undefined,
  );
  if (!live) return null;

  return (
    <section className="mb-10 rounded-2xl border border-rose-200/70 bg-rose-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-light tracking-tight">
            {t("enquiryCardTitle")}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {t("enquiryCardBody")}
          </p>
          <p className="mt-2 inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-rose-700">
            {t(STATUS_KEY[live.status])}
          </p>
        </div>
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm text-rose-700 transition-colors hover:bg-rose-50"
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </a>
      </div>
    </section>
  );
}
