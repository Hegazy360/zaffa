import { getLocale, getTranslations } from "next-intl/server";
import { OG_CONTENT_TYPE, OG_SIZE, brandCard } from "@/lib/og";

export const alt = "Zaffa — one team for the whole wedding";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The root share card.
 *
 * Every link to zaffa.ai that is not a microsite previews with this. It is the
 * dark plate rather than the light page, because a share card competes with a
 * chat thread's own background and the cool ink is what makes the rose read.
 *
 * Copy comes from the same `marketing` namespace as the page, so a WhatsApp
 * preview and the page it opens never disagree — and an Arabic share of an
 * Arabic page previews in Arabic.
 *
 * The headline is composed as two explicit short lines rather than one
 * paragraph. That is a hard requirement of `ogRtlLine`, not a style choice:
 * Satori has no bidi, and the word-reversal that fixes Arabic is only correct
 * on text that cannot wrap.
 */
export default async function OpengraphImage() {
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
