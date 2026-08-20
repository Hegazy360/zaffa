"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { whatsappLink } from "@/lib/contact-channels";

/**
 * One tap into a conversation, with the first message already written.
 *
 * WhatsApp is the Gulf's default business channel — 85–90% penetration, and
 * the incumbent regional concierge is literally a WhatsApp service — so this
 * is not a fallback for people who dislike forms. For a good share of visitors
 * it is the path they would have chosen first, and the form is the fallback.
 *
 * Two things make it work rather than just exist:
 *
 *  - **The message is prefilled.** Someone who has to compose an opening line
 *    to a company they have never dealt with often just does not send it.
 *    Prefilling removes that, and the message arrives carrying context we
 *    would otherwise spend the first two replies asking for.
 *  - **The click is attributed.** "How many people tapped WhatsApp" is
 *    useless next to "which surface made them do it" — that is the number
 *    that tells us where the conversation actually starts.
 */

export type WhatsAppSurface =
  | "home_whole_wedding"
  | "pricing"
  | "enquire_confirmation"
  | "enquire_form"
  | "dashboard_enquiry"
  | "microsite";

export function WhatsAppCta({
  surface,
  /** Extra context appended to the prefilled message — a microsite URL, a
   *  city, a reference. Kept short: WhatsApp shows the prefilled text in the
   *  compose box, and a wall of it looks like spam the visitor is being asked
   *  to send. */
  context,
  label,
  variant = "solid",
  className,
}: {
  surface: WhatsAppSurface;
  context?: string;
  label?: string;
  variant?: "solid" | "outline" | "quiet";
  className?: string;
}) {
  const t = useTranslations("whatsapp");

  const message = context
    ? `${t("prefill")}\n${context}`
    : t("prefill");
  const href = whatsappLink(message);

  const onClick = () => {
    track(ANALYTICS_EVENTS.WHATSAPP_CTA_CLICKED, {
      surface,
      has_context: Boolean(context),
    });
  };

  const text = label ?? t("cta");

  if (variant === "quiet") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm text-rose-700 underline-offset-4 transition-colors hover:underline",
          className,
        )}
      >
        <MessageCircle className="size-4 shrink-0" aria-hidden />
        {text}
      </a>
    );
  }

  return (
    <Button
      size="lg"
      render={
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
        />
      }
      className={cn(
        "h-12 gap-2 px-6",
        variant === "solid"
          ? "bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-600/20 transition-all hover:opacity-90"
          : "border border-rose-200/80 bg-white text-rose-700 hover:bg-rose-50/70 hover:text-rose-700",
        className,
      )}
    >
      <MessageCircle className="size-4" aria-hidden />
      {text}
    </Button>
  );
}
