import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Shared pieces of the Open Graph image system.
 *
 * The growth loop for this product is a link pasted into WhatsApp. Until now
 * that link previewed as a bare title with no image — or, on a microsite, as
 * the couple's raw full-resolution Cloudinary render, which is both a slow
 * preview and an unbranded one. These images are the artefact that actually
 * travels.
 *
 * Fonts are vendored into the repo rather than fetched from Google at request
 * time: an OG image that renders only when fonts.gstatic.com is reachable will
 * silently degrade to Satori's fallback exactly when a share is happening.
 * WOFF, not WOFF2 — Satori does not read WOFF2.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";
export const OG_PHOTO_CONTENT_TYPE = "image/jpeg";

/**
 * WhatsApp will not fetch a link preview image much over ~300 KB, and a
 * preview that never loads is the whole point of this system failing. Cards
 * that are mostly flat colour compress fine as the PNG `ImageResponse`
 * produces — the root card lands around 150 KB. A card with a photograph in it
 * does not: the microsite card came out at 1 MB.
 *
 * So photographic cards are re-encoded to JPEG. Quality 78 keeps the render
 * looking like the render at roughly a fifth of the bytes.
 */
export async function ogAsJpeg(image: Response): Promise<Response> {
  const png = Buffer.from(await image.arrayBuffer());
  const { default: sharp } = await import("sharp");
  const jpeg = await sharp(png).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "content-type": OG_PHOTO_CONTENT_TYPE,
      "cache-control": image.headers.get("cache-control") ?? "public, max-age=3600",
    },
  });
}

/** Cool ink, so the rose glow reads (the light/dark rhythm from D3). */
export const OG_INK = "#18181b";
export const OG_ROSE = "#e11d48";
export const OG_AMBER = "#f59e0b";
export const OG_CREAM = "#fdf3f0";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

/**
 * Font data for an ImageResponse, chosen by locale.
 *
 * Arabic needs an Arabic face: Fraunces has no Arabic coverage, so an Arabic
 * headline rendered with it comes out as tofu boxes — a share card worse than
 * no share card. Latin locales get Fraunces, the site's own display face.
 *
 * The Arabic face is **Cairo, not Reem Kufi**, even though Reem Kufi is the
 * site's Arabic display font. Satori's shaper rejects Reem Kufi outright —
 * `lookupType: 5 - substFormat: 1 is not yet supported`, a contextual
 * substitution table it does not implement — and returns a 500 rather than
 * degrading. Cairo shapes correctly, and it is already the site's Arabic body
 * face, so the card stays in the family. If Satori gains that lookup type,
 * this is a one-line change back.
 */
export async function ogFonts(locale: string) {
  const isArabic = locale === "ar";
  const file = isArabic ? "cairo-400.woff" : "fraunces-300.woff";
  const data = await readFile(path.join(FONT_DIR, file));
  return [
    {
      name: "OgDisplay",
      data,
      weight: (isArabic ? 400 : 300) as 300 | 400,
      style: "normal" as const,
    },
  ];
}

/** The wordmark, drawn rather than imported so it needs no image fetch. */
export function OgWordmark({ color = OG_CREAM }: { color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 34,
        letterSpacing: 2,
        color,
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          background: `linear-gradient(135deg, ${OG_ROSE}, ${OG_AMBER})`,
        }}
      />
      Zaffa
    </div>
  );
}

/**
 * Satori does not do bidi. This is the workaround, and its limits.
 *
 * Verified against the bundled renderer with a deliberately unambiguous probe
 * ("ا ب ت ث ج"): every glyph came out left-to-right, with and without
 * `direction: "rtl"` on the container. Satori shapes *within* a word correctly
 * — letters join, and their internal order is right-to-left — but it lays the
 * words themselves out in logical order, left to right. An Arabic headline
 * therefore renders as a sentence read backwards, which on a share card is
 * worse than no card at all.
 *
 * Reversing the word sequence fixes it, because each word is already drawn
 * correctly: `W1 W2 W3` becomes `W3 W2 W1`, laid out left to right, which
 * reads `W1 W2 W3` right to left. Punctuation rides along with its word, so a
 * trailing full stop ends up on the left of the last word, where it belongs.
 *
 * **This is only correct for a single line.** If the text wraps, Satori breaks
 * the reversed sequence into lines in the wrong places: `W5 W4 W3 / W2 W1`
 * reads as lines `W3 W4 W5` then `W1 W2`, which is the paragraph out of order.
 * Every caller must therefore pass one line at a time and render it with
 * `whiteSpace: "nowrap"`. That is why the cards below compose their headlines
 * from explicit short lines rather than one long string.
 *
 * It is also wrong for mixed-direction text — a Latin name or a number inside
 * an Arabic sentence would move to the wrong side. The cards keep Latin
 * fragments (a couple's name) in their own element rather than inline.
 */
export function ogRtlLine(text: string, isRtl: boolean): string {
  if (!isRtl) return text;
  return stripArabicMarks(text).trim().split(/\s+/).reverse().join(" ");
}

/**
 * Drop Arabic combining marks before rendering a card.
 *
 * Satori attaches marks by advance width rather than by the font's mark-anchor
 * tables, so a shadda on "بتتجوّزوا" lands over the wrong letter and reads as
 * a rendering fault. Harakat are optional in modern Arabic orthography — the
 * word is correctly spelled without them — so dropping them costs nothing on
 * a share card and removes a visible glitch.
 *
 * Card copy only. The site's own copy keeps its marks, where the browser
 * positions them properly.
 *
 * U+064B–U+0652 harakat, U+0653–U+0655 hamza marks, U+0670 dagger alif,
 * U+06D6–U+06ED Quranic annotation marks.
 */
export function stripArabicMarks(text: string): string {
  return text.replace(/[\u064B-\u0655\u0670\u06D6-\u06ED]/g, "");
}

/**
 * The brand card: dark plate, two headline lines, an eyebrow, a gradient rule.
 *
 * Shared by the root card and by `/r/[renderId]`, which deliberately shows
 * this instead of the render it is about — that render is behind a magic link,
 * and a link preview is fetched by every server the link passes through. A
 * private render leaking into WhatsApp's and Slack's preview caches is a
 * privacy bug, not a missed branding opportunity.
 *
 * `lines` must each be a single line: they render with `nowrap`, because the
 * RTL fix in `ogRtlLine` is only correct on text that cannot wrap.
 */
export async function brandCard({
  locale,
  lines,
  eyebrow,
}: {
  locale: string;
  lines: string[];
  eyebrow: string;
}): Promise<ImageResponse> {
  const isRtl = locale === "ar";
  const rendered = lines.map((line) => ogRtlLine(line, isRtl));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: isRtl ? "flex-end" : "flex-start",
          padding: 72,
          background: OG_INK,
          fontFamily: "OgDisplay",
        }}
      >
        {/* The glow. Two soft radials rather than a blur filter, which Satori
            does not implement — and the inset is spread in conditionally
            rather than set to "auto", which Satori rejects outright. */}
        <div
          style={{
            position: "absolute",
            top: -260,
            ...(isRtl ? { left: -180 } : { right: -180 }),
            width: 760,
            height: 760,
            borderRadius: 999,
            background:
              "radial-gradient(circle, rgba(225,29,72,0.38) 0%, rgba(225,29,72,0) 68%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -300,
            ...(isRtl ? { right: -160 } : { left: -160 }),
            width: 720,
            height: 720,
            borderRadius: 999,
            background:
              "radial-gradient(circle, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0) 70%)",
            display: "flex",
          }}
        />

        <OgWordmark />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            alignItems: isRtl ? "flex-end" : "flex-start",
          }}
        >
          {rendered.map((line) => (
            <div
              key={line}
              style={{
                display: "flex",
                whiteSpace: "nowrap",
                fontSize: isRtl ? 72 : 80,
                lineHeight: 1.1,
                color: OG_CREAM,
              }}
            >
              {line}
            </div>
          ))}
          <div
            style={{
              display: "flex",
              whiteSpace: "nowrap",
              marginTop: 8,
              fontSize: 30,
              color: "rgba(253,243,240,0.72)",
            }}
          >
            {ogRtlLine(eyebrow, isRtl)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            height: 8,
            width: 260,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${OG_ROSE}, ${OG_AMBER})`,
          }}
        />
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts(locale) },
  );
}
