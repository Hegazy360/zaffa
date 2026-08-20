import { getLocale, getTranslations } from "next-intl/server";
import { OG_CONTENT_TYPE, OG_SIZE, brandCard } from "@/lib/og";

export const alt = "Zaffa, one team for the whole wedding";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Deliberately generic, and that is the whole point of this file existing.
 *
 * `/r/[renderId]` is the magic-link reveal page: a visitor lands here from
 * their own email and sees a render nobody else is entitled to. A link
 * preview, however, is fetched by every server the link passes through -
 * WhatsApp, Slack, iMessage, whatever mail client forwarded it - and those
 * previews are cached far outside our control.
 *
 * Composing the render into this card would therefore push a private image
 * into third-party caches the moment anyone forwarded the email. So the card
 * shows the brand and nothing else. It is not a missed branding opportunity;
 * it is the correct answer.
 *
 * Without this file the route would inherit the root card, which would be
 * equally safe, the file exists so that the reasoning is written down where
 * someone would otherwise "improve" it by adding the render.
 */
export default async function RenderOgImage() {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("marketing"),
  ]);

  return brandCard({
    locale,
    lines: [
      `${t("heroTitlePart1")} ${t("heroTitleItalic")}`,
      `${t("heroTitleHighlight")}${t("heroTitleTail")}`,
    ],
    eyebrow: t("heroEyebrow"),
  });
}
