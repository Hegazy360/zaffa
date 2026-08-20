import "server-only";
import { getTranslations } from "next-intl/server";
import { fontFaceCss } from "@/lib/pdf";
import { isRtlLocale } from "@/i18n/config";
import { uiLocaleTag } from "@/lib/money-format";

/**
 * The lookbook, as HTML for Chromium to print.
 *
 * Written as a string rather than a React tree on purpose: this is a print
 * document with page rules, not an app surface, and the CSS it needs
 * (`@page`, `break-inside`, `print-color-adjust`) has nothing to do with the
 * rest of the design system. Keeping it in one file means the whole artefact
 * a customer paid for can be read top to bottom.
 *
 * Everything that made the old react-pdf version unable to serve the primary
 * market is fixed here structurally, not patched:
 *
 *  - `dir` and `lang` on the root, so Chromium does the shaping, bidi and
 *    mirroring rather than us approximating them.
 *  - Fonts inlined from disk. The previous version fetched from jsDelivr at
 *    render time; a CDN blip did not degrade a paid PDF, it replaced every
 *    glyph with Helvetica — which for Arabic means tofu.
 *  - Every string translated, and dates through `Intl.DateTimeFormat` in the
 *    reader's locale instead of a hardcoded `"en-US"`.
 */

export interface LookbookData {
  recipientName: string;
  publishedAt: Date | null;
  design: {
    name: string | null;
    event_type: string | null;
    setting: string | null;
    size: string | null;
    palette: { name?: string; colors: string[] };
    /** Keyed by reference category. A partial record rather than a
     *  total one, because the designer can add a category before this file
     *  knows about it and a missing bucket must read as empty, not crash. */
    references: Partial<Record<string, { id: string; url: string }[]>>;
    style_notes: string | null;
    media: { id: string; type: string; url: string }[];
  };
}

const CATEGORY_ORDER = [
  "overall_vibe",
  "venue_decor",
  "tables",
  "flowers",
  "lighting",
] as const;

/** Escape for HTML text and attribute contexts. Everything interpolated below
 *  is customer-supplied (a design name, style notes, their own name), so it
 *  all goes through here — a lookbook is not a place to discover an injection. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function renderLookbookHtml(
  data: LookbookData,
  locale: string,
): Promise<string> {
  const [t, fonts] = await Promise.all([
    getTranslations("lookbook"),
    fontFaceCss(),
  ]);

  const rtl = isRtlLocale(locale);
  const { design, recipientName, publishedAt } = data;

  const dateLabel = publishedAt
    ? new Intl.DateTimeFormat(uiLocaleTag(locale), {
        month: "long",
        year: "numeric",
      }).format(new Date(publishedAt))
    : "";

  const categories = CATEGORY_ORDER.filter(
    (c) => (design.references[c]?.length ?? 0) > 0,
  );
  const renders = design.media.filter((m) => m.type === "render").slice(0, 12);

  // `event_type`, `setting` and `size` are enum-ish strings from the designer.
  // They were previously capitalised English; now they resolve to translated
  // labels, falling back to the raw value if a new one appears before its copy.
  const label = (key: string, value: string | null) =>
    value ? t.has(`${key}.${value}`) ? t(`${key}.${value}`) : value : "";

  const meta = [
    label("eventType", design.event_type),
    label("setting", design.setting),
    label("size", design.size),
  ]
    .filter(Boolean)
    .join(" · ");

  const swatches = design.palette.colors
    .slice(0, 6)
    .map(
      (c) =>
        `<span class="swatch" style="background:${esc(c)}"></span>`,
    )
    .join("");

  const moodboard = categories
    .map((cat) => {
      const items = design.references[cat] ?? [];
      const cells = items
        .map(
          (r) =>
            `<div class="cell"><img src="${esc(r.url)}" alt="" /></div>`,
        )
        .join("");
      return `
        <section class="category">
          <div class="category-head">
            <h3>${esc(t(`category.${cat}`))}</h3>
            <span class="count">${t("pictureCount", { count: items.length })}</span>
          </div>
          <div class="grid">${cells}</div>
        </section>`;
    })
    .join("");

  const renderPages = renders
    .map(
      (r, i) => `
      <article class="page render-page">
        <header class="page-head">
          <span class="brand">Zaffa</span>
          <span class="label">${esc(
            t("renderCounter", { index: i + 1, total: renders.length }),
          )}</span>
        </header>
        <div class="render-frame"><img src="${esc(r.url)}" alt="" /></div>
        <p class="caption">${esc(meta)}</p>
        <footer class="page-foot">
          <span>${esc(t("title"))}</span><span>${esc(recipientName)}</span>
        </footer>
      </article>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${esc(locale)}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<title>${esc(recipientName)} — ${esc(t("title"))}</title>
<style>
${fonts}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: ${rtl ? '"Cairo"' : '"Inter"'}, sans-serif;
  color: #1c1917;
  background: #fff;
}
.page {
  width: 210mm; height: 297mm;
  padding: 18mm 16mm;
  display: flex; flex-direction: column;
  page-break-after: always; break-after: page;
  position: relative;
  background: #fff;
}
.page:last-child { page-break-after: auto; break-after: auto; }

.cover { justify-content: center; background: #18181b; color: #fdf3f0; }
.cover .eyebrow { color: rgba(253,243,240,.6); }
.cover h1 {
  font-family: ${rtl ? '"Cairo"' : '"Fraunces"'}, serif;
  font-weight: 300;
  font-size: ${rtl ? "34pt" : "38pt"};
  line-height: 1.1;
  margin-top: 8mm;
}
.cover h2 { font-weight: 400; font-size: 13pt; color: rgba(253,243,240,.75); margin-top: 4mm; }
.hairline { height: 2px; width: 44mm; margin: 8mm 0; background: linear-gradient(90deg,#e11d48,#f59e0b); }
.meta { font-size: 10pt; color: rgba(253,243,240,.65); line-height: 1.6; white-space: pre-line; }
.palette { display: flex; gap: 3mm; margin-top: 10mm; }
.swatch { width: 14mm; height: 14mm; border-radius: 2mm; display: block; }

.eyebrow { font-size: 8pt; letter-spacing: ${rtl ? "0" : ".22em"}; text-transform: uppercase; }
.page-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10mm; }
.brand { font-family: ${rtl ? '"Cairo"' : '"Fraunces"'}, serif; font-size: 12pt; }
.label { font-size: 8pt; letter-spacing: ${rtl ? "0" : ".18em"}; text-transform: uppercase; color: #78716c; }
h2.section { font-family: ${rtl ? '"Cairo"' : '"Fraunces"'}, serif; font-weight: 300; font-size: 22pt; margin-bottom: 8mm; }

.category { break-inside: avoid; page-break-inside: avoid; margin-bottom: 8mm; }
.category-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #e7e5e4; padding-bottom: 2mm; margin-bottom: 4mm; }
.category-head h3 { font-size: 11pt; font-weight: 600; }
.count { font-size: 8pt; color: #78716c; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
.cell { aspect-ratio: 1; overflow: hidden; border-radius: 2mm; background: #f5f5f4; }
.cell img { width: 100%; height: 100%; object-fit: cover; display: block; }

.notes { margin-top: 6mm; font-size: 10pt; line-height: 1.7; color: #44403c; font-style: italic; }

.render-page { justify-content: flex-start; }
.render-frame { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 3mm; background: #f5f5f4; }
.render-frame img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.caption { margin-top: 4mm; font-size: 9pt; color: #78716c; text-align: center; }

.page-foot {
  position: absolute; inset-inline: 16mm; bottom: 12mm;
  display: flex; justify-content: space-between;
  font-size: 8pt; color: #a8a29e;
}
</style>
</head>
<body>

<article class="page cover">
  <div>
    <p class="eyebrow">${esc(t("title"))}</p>
    <h1>${esc(recipientName)}</h1>
    <h2>${esc(design.name || t("untitled"))}</h2>
    <div class="hairline"></div>
    <p class="meta">${esc(meta || t("untitled"))}${
      dateLabel ? "\n" + esc(t("printed", { date: dateLabel })) : ""
    }</p>
    ${swatches ? `<div class="palette">${swatches}</div>` : ""}
  </div>
</article>

${
  categories.length
    ? `<article class="page">
  <header class="page-head">
    <span class="brand">Zaffa</span>
    <span class="label">${esc(t("moodboard"))}</span>
  </header>
  <h2 class="section">${esc(t("theReferences"))}</h2>
  ${moodboard}
  ${design.style_notes ? `<p class="notes">“${esc(design.style_notes)}”</p>` : ""}
  <footer class="page-foot"><span>${esc(t("title"))}</span><span>${esc(recipientName)}</span></footer>
</article>`
    : ""
}

${renderPages}

<article class="page cover">
  <div>
    <p class="eyebrow">${esc(t("madeWith"))}</p>
    <h1>${esc(t("closingTitle"))}</h1>
    <div class="hairline"></div>
    <p class="meta">zaffa.ai</p>
  </div>
</article>

</body>
</html>`;
}
