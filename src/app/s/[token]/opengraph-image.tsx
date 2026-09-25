import { ImageResponse } from "next/og";
import { getLocale, getTranslations } from "next-intl/server";
import { isFlagEnabled } from "@/lib/flags";
import {
  OG_AMBER,
  OG_CREAM,
  OG_INK,
  OG_PHOTO_CONTENT_TYPE,
  OG_ROSE,
  OG_SIZE,
  OgWordmark,
  brandCard,
  ogAsJpeg,
  ogFonts,
  ogRtlLine,
} from "@/lib/og";
import { SHARE_OG_PANEL, loadShareOgCard } from "@/server/services/design-shares";

export const alt = "Which one should we choose?";
export const size = OG_SIZE;
export const contentType = OG_PHOTO_CONTENT_TYPE;

// Short, because a revoked link should stop previewing the design soon after
// it is revoked, but not zero: the card is expensive to compose and the
// first minutes of a link going round a family group are when it is fetched.
export const revalidate = 600;

/**
 * The card a family WhatsApp group sees above a share link (F6): the newest
 * render beside "Which one should we choose?" and the couple's first name.
 *
 * Unlike `/r/[renderId]`, the render belongs on this card: the couple made
 * this link precisely to show it to people. It is still ALWAYS the
 * watermarked render, whatever the couple's tier, because a preview is
 * copied into the caches of every server the link passes through.
 *
 * A dead link (unknown, revoked, feature off) previews as the plain brand
 * card rather than failing, so a stale message never shows a broken image.
 */
export default async function FamilyShareOgImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, locale, t] = await Promise.all([
    params,
    getLocale(),
    getTranslations("familyShare"),
  ]);
  const isRtl = locale === "ar";
  const card = isFlagEnabled("familyShare") ? await loadShareOgCard(token, { rtl: isRtl }) : null;

  if (!card?.imageUrl) {
    return brandCard({
      locale,
      lines: [t("ogKicker")],
      eyebrow: t("footerCta"),
    });
  }

  const text = (
    <div
      key="text"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: isRtl ? "flex-end" : "flex-start",
        padding: 64,
        width: OG_SIZE.width - SHARE_OG_PANEL.width,
      }}
    >
      <OgWordmark />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: isRtl ? "flex-end" : "flex-start",
        }}
      >
        {/* One line in Arabic: `ogRtlLine` is only correct on text that
            cannot wrap. English may wrap, it reads left to right. */}
        <div
          style={{
            display: "flex",
            fontSize: isRtl ? 60 : 56,
            lineHeight: 1.12,
            color: OG_CREAM,
            ...(isRtl ? { whiteSpace: "nowrap" as const } : { maxWidth: 440 }),
          }}
        >
          {ogRtlLine(t("ogKicker"), isRtl)}
        </div>
        {/* The name in its own element, never inside the reversed line:
            it is as often Latin as Arabic. One word by construction. */}
        {card.coupleName ? (
          <div style={{ display: "flex", fontSize: 34, color: "rgba(253,243,240,0.72)" }}>
            {card.coupleName}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          height: 8,
          width: 200,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${OG_ROSE}, ${OG_AMBER})`,
        }}
      />
    </div>
  );

  const panel = (
    <div key="panel" style={{ display: "flex", position: "relative", width: SHARE_OG_PANEL.width }}>
      {/* A plain <img>: Satori renders this tree, next/image means nothing
          here. Already cut to the panel, so the watermark sits on what is
          shown. */}
      <img
        src={card.imageUrl}
        alt=""
        width={SHARE_OG_PANEL.width}
        height={SHARE_OG_PANEL.height}
        style={{ width: SHARE_OG_PANEL.width, height: SHARE_OG_PANEL.height }}
      />
      {/* Explicit box, not `inset: 0`: Satori drops the shorthand. The fade
          is on the side that meets the text. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: SHARE_OG_PANEL.width,
          height: SHARE_OG_PANEL.height,
          display: "flex",
          background: isRtl
            ? `linear-gradient(90deg, rgba(24,24,27,0) 72%, ${OG_INK} 100%)`
            : `linear-gradient(90deg, ${OG_INK} 0%, rgba(24,24,27,0) 28%)`,
        }}
      />
    </div>
  );

  // Children in visual order rather than `row-reverse`: under a reversed
  // row Satori also lays the words of the reversed Arabic line out in
  // reverse, which undoes `ogRtlLine` and reads the question backwards.
  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          background: OG_INK,
          fontFamily: "OgDisplay",
        }}
      >
        {isRtl ? [panel, text] : [text, panel]}
      </div>
    ),
    { ...size, fonts: await ogFonts(locale) },
  );
  return ogAsJpeg(image);
}
