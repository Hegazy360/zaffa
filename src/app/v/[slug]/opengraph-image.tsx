import { ImageResponse } from "next/og";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import {
  OG_AMBER,
  OG_CREAM,
  OG_INK,
  OG_ROSE,
  OG_SIZE,
  OG_PHOTO_CONTENT_TYPE,
  OgWordmark,
  ogAsJpeg,
  ogFonts,
  ogRtlLine,
} from "@/lib/og";

export const alt = "A wedding designed in Zaffa";
export const size = OG_SIZE;
export const contentType = OG_PHOTO_CONTENT_TYPE;

// A microsite's hero render does not change often, and the card is expensive
// to compose (a remote image fetch plus font loading). An hour is long enough
// to survive a link going round a family WhatsApp group.
export const revalidate = 3600;

/**
 * The WhatsApp artefact.
 *
 * This is the single most-shared surface in the product: a couple sends their
 * microsite to their family, and this image is what the family sees before
 * anyone taps. Until now the preview was the raw full-resolution Cloudinary
 * render - multiple megabytes, unbranded, and often cropped by the client into
 * a meaningless slice of a table.
 *
 * Now: the render on the right in a framed panel, their names and Zaffa on the
 * left, on the dark plate. If the pack has no render yet, the whole right side
 * is dropped rather than left as an empty box, and the card degrades into a
 * branded title card.
 */
export default async function MicrositeOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, locale, t] = await Promise.all([
    params,
    getLocale(),
    getTranslations("visionPack"),
  ]);
  const isRtl = locale === "ar";

  const pack = await prisma.visionPack.findFirst({
    where: { microsite_slug: slug, microsite_published_at: { not: null } },
    select: {
      recipient: { select: { full_name: true } },
      recipient_user_id: true,
    },
  });

  let heroUrl: string | null = null;
  if (pack?.recipient_user_id) {
    const design = await prisma.venueDesign.findFirst({
      where: { user_id: pack.recipient_user_id },
      orderBy: { updated_at: "desc" },
      select: {
        thumbnail: true,
        media: {
          where: { type: "render" },
          orderBy: { created_at: "desc" },
          take: 1,
          select: { url: true },
        },
      },
    });
    heroUrl = design?.media[0]?.url ?? design?.thumbnail ?? null;
  }

  // Names stay in their own element and are never reversed: they are as often
  // Latin as Arabic, and `ogRtlLine` is only correct on uniformly RTL text.
  const names = pack?.recipient?.full_name ?? null;
  const kicker = ogRtlLine(t("micrositeOgKicker"), isRtl);

  const card = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: isRtl ? "row-reverse" : "row",
          background: OG_INK,
          fontFamily: "OgDisplay",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: isRtl ? "flex-end" : "flex-start",
            padding: 64,
            width: heroUrl ? 620 : 1200,
          }}
        >
          <OgWordmark />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              alignItems: isRtl ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                display: "flex",
                whiteSpace: "nowrap",
                fontSize: 28,
                color: "rgba(253,243,240,0.66)",
              }}
            >
              {kicker}
            </div>
            {names && (
              <div
                style={{
                  display: "flex",
                  fontSize: 58,
                  lineHeight: 1.15,
                  color: OG_CREAM,
                  maxWidth: heroUrl ? 480 : 900,
                }}
              >
                {names}
              </div>
            )}
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

        {heroUrl && (
          <div style={{ display: "flex", position: "relative", width: 580 }}>
            {/* A plain <img>: this tree is rendered by Satori, not by React
                DOM, and next/image has no meaning inside an ImageResponse. */}
            <img
              src={heroUrl}
              alt=""
              width={580}
              height={630}
              style={{ objectFit: "cover", width: 580, height: 630 }}
            />
            {/* A one-sided fade so the panel joins the plate instead of
                sitting on it as a hard rectangle. */}
            <div
              style={{
                // Explicit box rather than `inset: 0`, Satori does not
                // implement the `inset` shorthand and silently drops it, which
                // left the photo meeting the plate as a hard rectangle.
                position: "absolute",
                top: 0,
                left: 0,
                width: 580,
                height: 630,
                display: "flex",
                // Always a 90deg gradient with the stops swapped, rather than
                // 270deg: Satori's gradient parser handles the stop order
                // reliably and the angle less so.
                background: isRtl
                  ? `linear-gradient(90deg, rgba(24,24,27,0) 68%, ${OG_INK} 100%)`
                  : `linear-gradient(90deg, ${OG_INK} 0%, rgba(24,24,27,0) 32%)`,
              }}
            />
          </div>
        )}
      </div>
    ),
    { ...size, fonts: await ogFonts(locale) },
  );
  return ogAsJpeg(card);
}
