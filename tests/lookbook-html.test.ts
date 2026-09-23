import { describe, expect, it, vi, beforeAll } from "vitest";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";
import { computeDecorPlan } from "@/lib/decor-pricing";
import type { DecorAnalysis } from "@/lib/decor-analysis";

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

// The real ICU formatter (plurals included), so the plan pages' Arabic
// plural forms are checked as a reader would see them.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("use-intl/core");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({
        locale: currentMessages === (arMessages as unknown) ? "ar" : "en",
        messages: currentMessages as unknown as Record<string, never>,
        namespace: namespace as never,
      }),
  };
});

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

// ---- F4: the design partner pages -----------------------------------------

const ANALYSIS: DecorAnalysis = {
  table_shape: "round",
  centerpiece: "mixed",
  has_stage: true,
  has_arch: false,
  has_entrance_decor: true,
  has_dance_floor: true,
  has_draping: true,
  has_chandeliers: true,
  has_string_lights: false,
  candle_density: "some",
  floral_density: "lush",
  flowers: ["rose", "baby_breath"],
  linens: "floor_length",
  chair_style: "chiavari",
  questions: [],
};

const EG_PLAN = computeDecorPlan(ANALYSIS, {
  guestCount: 180,
  setting: "indoor",
  market: "EG",
});

const EASTERN_ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;

/** The markup of every page with this class, joined. */
function pages(html: string, cls: string): string {
  const re = new RegExp(`<article class="page ${cls}">[\\s\\S]*?</article>`, "g");
  return (html.match(re) ?? []).join("\n");
}

describe("renderLookbookHtml: the chosen version", () => {
  const media = Array.from({ length: 20 }, (_, i) => ({
    id: `r${i}`,
    type: "render",
    url: `https://res.cloudinary.com/x/r${i}.jpg`,
  }));

  it("leads with the render the couple chose, labelled as theirs, even past the cap", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(
      { ...data, design: { ...data.design, media, selected_media_id: "r19" } },
      "en",
    );
    const renderPages = html.match(/<article class="page render-page">[\s\S]*?<\/article>/g) ?? [];
    expect(renderPages).toHaveLength(16);
    expect(renderPages[0]).toContain("r19.jpg");
    expect(renderPages[0]).toContain(enMessages.lookbook.chosenLabel);
    // Then the newest, in order, one fewer of them to make room.
    expect(renderPages[1]).toContain("r0.jpg");
    expect(html).not.toContain("r15.jpg");
    expect((html.match(/r19\.jpg/g) ?? []).length).toBe(1);
  });

  it("keeps newest-first when the chosen id is not one of the renders", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(
      { ...data, design: { ...data.design, media, selected_media_id: "gone" } },
      "en",
    );
    const first = html.match(/<article class="page render-page">[\s\S]*?<\/article>/)?.[0];
    expect(first).toContain("r0.jpg");
    expect(html).not.toContain(enMessages.lookbook.chosenLabel);
  });
});

describe("renderLookbookHtml: your venue, before and after", () => {
  const beforeAfter = {
    beforeUrl: "https://res.cloudinary.com/x/venue.jpg",
    afterUrl: "https://res.cloudinary.com/x/dressed.jpg",
  };

  it("sets the venue photo beside the render that dressed it", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml({ ...data, beforeAfter }, "en");
    const page = pages(html, "venue-page");
    expect(page).toContain(enMessages.lookbook.venueTitle);
    expect(page).toContain("venue.jpg");
    expect(page).toContain("dressed.jpg");
    // Before comes first in reading order, in both directions.
    expect(page.indexOf("venue.jpg")).toBeLessThan(page.indexOf("dressed.jpg"));
    expect(page).toContain(enMessages.lookbook.venueBefore);
    expect(page).toContain(enMessages.lookbook.venueAfter);
  });

  it("has no venue page without a pair", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml({ ...data, beforeAfter: null }, "en");
    expect(pages(html, "venue-page")).toBe("");
    expect(html).not.toContain(enMessages.lookbook.venueTitle);
  });

  it("escapes the image URLs", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(
      { ...data, beforeAfter: { ...beforeAfter, beforeUrl: 'https://x/"><script>' } },
      "en",
    );
    expect(html).not.toContain('"><script>');
  });

  it("is translated in Arabic", async () => {
    currentMessages = arMessages as unknown as Messages;
    const html = await renderLookbookHtml({ ...data, beforeAfter }, "ar");
    expect(pages(html, "venue-page")).toContain(arMessages.lookbook.venueTitle);
  });
});

describe("renderLookbookHtml: what it takes to build this", () => {
  it("prints the plan table, total, disclaimer, assumptions and questions", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(
      { ...data, decorPlan: { plan: EG_PLAN, questions: ["Real or silk roses?"] } },
      "en",
    );
    const plan = pages(html, "plan-page");
    expect((plan.match(/<article class="page plan-page">/g) ?? []).length).toBe(2);
    expect(plan).toContain(enMessages.decorPlan.title);
    // Every line the plan has, by its translated name, and nothing else.
    for (const item of EG_PLAN.items) {
      expect(plan).toContain(enMessages.decorPlan.items[item.key]);
    }
    expect(plan).not.toContain(enMessages.decorPlan.items.tent);
    // Quantities through the real plural rules.
    expect(plan).toContain("180 chairs");
    expect(plan).toContain("For 180 guests");
    // Amounts are isolated for bidi, in the plan's currency.
    expect(plan).toMatch(/<bdi>EGP[\s\u00a0][\d,]+<\/bdi> to <bdi>EGP/);
    expect(plan).toContain("Egypt");
    expect(plan).toContain(enMessages.decorPlan.assumptions.eg_estimates);
    expect(plan).toContain("Real or silk roses?");
    expect(plan).not.toContain(enMessages.decorPlan.fallbackQuestions.q1);
  });

  it("sits after the renders and before the closing page", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(
      { ...data, decorPlan: { plan: EG_PLAN, questions: [] } },
      "en",
    );
    const at = (needle: string) => html.indexOf(needle);
    expect(at('class="page render-page"')).toBeLessThan(at('class="page plan-page"'));
    expect(at('class="page plan-page"')).toBeLessThan(
      at(enMessages.lookbook.makeItRealTitle),
    );
  });

  it("falls back to the standard questions when the model's are in another language", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(
      { ...data, decorPlan: { plan: EG_PLAN, questions: [] } },
      "en",
    );
    expect(html).toContain(enMessages.decorPlan.fallbackQuestions.q1);
    expect(html).toContain(enMessages.decorPlan.fallbackQuestions.q3);
  });

  it("uses Latin digits for every amount and count in Arabic", async () => {
    currentMessages = arMessages as unknown as Messages;
    const html = await renderLookbookHtml(
      { ...data, decorPlan: { plan: EG_PLAN, questions: [] } },
      "ar",
    );
    const plan = pages(html, "plan-page");
    expect(plan).toContain(arMessages.decorPlan.title);
    expect(plan).toContain(arMessages.decorPlan.items.chair_rental);
    expect(plan).toContain("ج.م");
    expect(plan).toMatch(/[0-9]/);
    expect(plan).not.toMatch(EASTERN_ARABIC_DIGITS);
    // Arabic plural forms with the Latin count: 180 is "many" in Arabic.
    expect(plan).toContain("180 كرسيًا");
    expect(plan).toContain(arMessages.decorPlan.fallbackQuestions.q1);
  });

  it("escapes the model's questions", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml(
      { ...data, decorPlan: { plan: EG_PLAN, questions: ["<img src=x onerror=alert(1)>"] } },
      "en",
    );
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;img src=x");
  });

  it("has no plan pages without a plan", async () => {
    currentMessages = enMessages;
    const html = await renderLookbookHtml({ ...data, decorPlan: null }, "en");
    expect(pages(html, "plan-page")).toBe("");
  });
});

