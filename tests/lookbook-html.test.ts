import { describe, expect, it, vi, beforeAll } from "vitest";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";

/**
 * The lookbook template, which is a *paid* artefact.
 *
 * The failures this guards are the ones the react-pdf version actually
 * shipped: Arabic that cannot render, a hardcoded `en-US` date, English
 * strings in every locale, and fonts fetched from a CDN at render time - where
 * an outage does not degrade the PDF, it replaces every glyph with Helvetica,
 * which for Arabic is tofu.
 */

type Messages = typeof enMessages;

let currentMessages: Messages = enMessages;

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => {
    const dict = (currentMessages as unknown as Record<string, unknown>)[ns] as Record<
      string,
      unknown
    >;
    const read = (key: string) =>
      key.split(".").reduce<unknown>((acc, part) => {
        if (acc && typeof acc === "object") {
          return (acc as Record<string, unknown>)[part];
        }
        return undefined;
      }, dict);
    const t = (key: string, values?: Record<string, unknown>) => {
      const raw = read(key);
      if (typeof raw !== "string") return key;
      // Enough ICU for the assertions here: simple args and one plural.
      return raw
        .replace(/\{(\w+), plural,[^}]*\}/g, String(values?.count ?? ""))
        .replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? ""));
    };
    t.has = (key: string) => typeof read(key) === "string";
    return t;
  },
}));

vi.mock("server-only", () => ({}));

let renderLookbookHtml: typeof import("@/lib/lookbook-html").renderLookbookHtml;

beforeAll(async () => {
  ({ renderLookbookHtml } = await import("@/lib/lookbook-html"));
});

const data = {
  recipientName: "Mohamed & Layla",
  publishedAt: new Date("2026-05-07T00:00:00Z"),
  micrositeUrl: "https://www.zaffa.ai/v/abc123",
  micrositeQrDataUrl: "data:image/png;base64,QRDATA",
  design: {
    name: "Garden at dusk",
    event_type: "wedding",
    setting: "garden",
    size: "medium",
    guest_count: 150,
    palette: { name: "Blush & Gold", colors: ["#e11d48", "#f59e0b", "#1c1917"] },
    references: {
      overall_vibe: [{ id: "a", url: "https://res.cloudinary.com/x/a.jpg" }],
      flowers: [
        {
          id: "b",
          url: "https://res.cloudinary.com/x/b.jpg",
          attribution: "Photo: someone on Pinterest",
        },
        { id: "c", url: "https://res.cloudinary.com/x/c.jpg" },
      ],
    },
    style_notes: "Candlelight, long tables, nothing symmetrical.",
    media: [
      { id: "r1", type: "render", url: "https://res.cloudinary.com/x/r1.jpg" },
      { id: "v1", type: "video", url: "https://res.cloudinary.com/x/v1.mp4" },
    ],
  },
};

describe("renderLookbookHtml", () => {
  it("sets dir and lang so Chromium does the shaping", async () => {
    currentMessages = arMessages as unknown as Messages;
    const ar = await renderLookbookHtml(data, "ar");
    expect(ar).toContain('lang="ar"');
    expect(ar).toContain('dir="rtl"');

    currentMessages = enMessages;
    const en = await renderLookbookHtml(data, "en");
    expect(en).toContain('dir="ltr"');
  });

  it("inlines every font instead of fetching one", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(data, "en");
    expect(html).not.toMatch(/https?:\/\/[^"')]*\.(ttf|woff2?)/);
    expect(html).not.toContain("jsdelivr");
    expect((html.match(/@font-face/g) ?? []).length).toBe(5);
    expect(html).toContain("data:font/ttf;base64,");
  });

  it("uses Cairo as the body face in Arabic, not a Latin-only one", async () => {
    currentMessages = arMessages as unknown as Messages;
    const html = await renderLookbookHtml(data, "ar");
    expect(html).toMatch(/body\s*\{[^}]*font-family:\s*"Cairo"/);
    // Fraunces has no Arabic coverage; using it for Arabic headings is how the
    // old version produced tofu.
    expect(html).not.toMatch(/\.cover h1 \{[^}]*font-family:\s*"Fraunces"/);
  });

  it("drops letter-spacing in RTL, where it breaks glyph joining", async () => {
    currentMessages = arMessages as unknown as Messages;
    const ar = await renderLookbookHtml(data, "ar");
    expect(ar).toMatch(/\.eyebrow \{[^}]*letter-spacing:\s*0[;}]/);

    currentMessages = enMessages;
    const en = await renderLookbookHtml(data, "en");
    expect(en).toMatch(/\.eyebrow \{[^}]*letter-spacing:\s*\.22em/);
  });

  it("formats the date in the reader's locale, never en-US", async () => {
    currentMessages = arMessages as unknown as Messages;
    const ar = await renderLookbookHtml(data, "ar");
    expect(ar).toContain("مايو");
    expect(ar).not.toContain("May 2026");
  });

  it("translates the category and attribute labels", async () => {
    currentMessages = arMessages as unknown as Messages;
    const ar = await renderLookbookHtml(data, "ar");
    expect(ar).toContain(arMessages.lookbook.category.flowers);
    expect(ar).toContain(arMessages.lookbook.setting.garden);
    expect(ar).not.toContain("Florals");
  });

  it("escapes customer-supplied text", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(
      {
        ...data,
        recipientName: '<script>alert(1)</script>',
        design: { ...data.design, style_notes: 'a " quote & an <b>' },
      },
      "en",
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });

  it("renders one page per render, and ignores videos", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(data, "en");
    expect((html.match(/class="page render-page"/g) ?? []).length).toBe(1);
    expect(html).not.toContain("v1.mp4");
  });

  it("caps render pages at 16, newest first", async () => {
    currentMessages = enMessages;
    const media = Array.from({ length: 25 }, (_, i) => ({
      id: `r${i}`,
      type: "render",
      url: `https://res.cloudinary.com/x/r${i}.jpg`,
    }));
    const html = await renderLookbookHtml(
      { ...data, design: { ...data.design, media } },
      "en",
    );
    expect((html.match(/class="page render-page"/g) ?? []).length).toBe(16);
    // The route orders media newest-first; the cap must keep the head.
    expect(html).toContain("r0.jpg");
    expect(html).not.toContain("r20.jpg");
  });

  it("gives every reference category its own page, with attributions escaped", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(
      {
        ...data,
        design: {
          ...data.design,
          references: {
            ...data.design.references,
            flowers: [
              {
                id: "b",
                url: "https://res.cloudinary.com/x/b.jpg",
                attribution: 'Pin by <b>"someone"</b>',
              },
            ],
          },
        },
      },
      "en",
    );
    // Two categories in the fixture → two moodboard pages, each carrying
    // the category as its section heading.
    expect(html).toContain(enMessages.lookbook.category.overall_vibe);
    expect(html).toContain(enMessages.lookbook.category.flowers);
    // Attribution is customer/third-party text, must pass esc().
    expect(html).not.toContain('<b>"someone"</b>');
    expect(html).toContain("&lt;b&gt;");
  });

  it("renders the details page with guest count and palette hex captions", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(data, "en");
    expect(html).toContain(enMessages.lookbook.detailsTitle);
    expect(html).toContain("150");
    expect(html).toContain("#e11d48");
    expect(html).toContain("Blush &amp; Gold");
  });

  it("renders the microsite QR page only when a slug exists", async () => {
    currentMessages = enMessages;
    const withSlug = await renderLookbookHtml(data, "en");
    expect(withSlug).toContain("data:image/png;base64,QRDATA");
    expect(withSlug).toContain("https://www.zaffa.ai/v/abc123");

    const without = await renderLookbookHtml(
      { ...data, micrositeUrl: null, micrositeQrDataUrl: null },
      "en",
    );
    // The CSS block always names the selector; the markup must not.
    expect(without).not.toContain('class="page microsite-page"');
  });

  it("closes with the concierge page carrying the reply promise", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(data, "en");
    expect(html).toContain(enMessages.lookbook.makeItRealTitle);
    // REPLY_WITHIN_HOURS is interpolated, the number must appear.
    expect(html).toMatch(/24\s*hours|within 24/i);
    expect(html).toContain("wa.me");
  });
});
