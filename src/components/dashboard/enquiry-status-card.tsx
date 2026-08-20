"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { WhatsAppCta } from "@/components/marketing/whatsapp-cta";

/**
 * "We're on it", the couple's view of a live enquiry.
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
  const tWa = useTranslations("whatsapp");
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
        {/* Their enquiry is already in our pipeline, so the prefilled message
            carries the reference, the operator opens the chat already knowing
            which lead it is, instead of asking. */}
        <WhatsAppCta
          surface="dashboard_enquiry"
          context={`Ref: ${live.id.slice(0, 8)}`}
          label={tWa("ctaShort")}
          variant="outline"
          className="h-10 rounded-full px-4 text-sm"
        />
      </div>
    </section>
  );
}
