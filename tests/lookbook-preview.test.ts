import { describe, it, vi, beforeAll } from "vitest";
import { writeFile } from "node:fs/promises";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";
import { computeDecorPlan } from "@/lib/decor-pricing";

/**
 * Not an assertion, a generator. Writes the real template through the real
 * Chromium path so the artefact a customer pays for can be looked at, in both
 * directions, rather than inferred from unit tests. Skipped unless
 * `LOOKBOOK_PREVIEW=1`.
 */
const OUT = process.env.LOOKBOOK_PREVIEW_DIR ?? "/tmp";
let currentMessages: typeof enMessages = enMessages;

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
let htmlToPdf: typeof import("@/lib/pdf").htmlToPdf;
beforeAll(async () => {
  ({ renderLookbookHtml } = await import("@/lib/lookbook-html"));
  ({ htmlToPdf } = await import("@/lib/pdf"));
});

const IMG = "https://res.cloudinary.com/dz0tdjoqj/image/upload/v1778150961/zaffa-renders/juqkmgfqyz4obopj6ihk.jpg";

// Worst-case shape on purpose: every category populated, near the reference
// cap, the full 16-render cap, notes, QR page - the document whose cold
// render time the route timeout has to survive.
const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    url: IMG,
    attribution: i % 2 === 0 ? "Pin: @weddingdreams via Pinterest" : undefined,
  }));
const data = {
  recipientName: "محمد وليلى",
  publishedAt: new Date("2026-05-07T00:00:00Z"),
  micrositeUrl: "https://www.zaffa.ai/v/pwvtun6cvc",
  micrositeQrDataUrl:
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  design: {
    name: "حديقة عند الغروب",
    event_type: "wedding",
    setting: "garden",
    size: "medium",
    guest_count: 175,
    palette: {
      name: "Blush & Gold",
      colors: ["#e11d48", "#f59e0b", "#1c1917", "#fdf3f0"],
    },
    references: {
      overall_vibe: refs(10),
      venue_decor: refs(8),
      tables: refs(10),
      flowers: refs(9),
      lighting: refs(7),
    },
    style_notes: "شموع، وطاولات طويلة، ولا شيء متماثل.",
    media: Array.from({ length: 16 }, (_, i) => ({
      id: `m${i}`,
      type: "render",
      url: IMG,
    })),
    selected_media_id: "m3",
  },
  beforeAfter: {
    beforeUrl: "https://res.cloudinary.com/demo/image/upload/w_1600,c_limit/sample.jpg",
    afterUrl: IMG,
  },
};

// The longest plan the rules can produce: every line present (a tent, so
// draping too), the guest count assumed from the size, Egypt's caveats.
const WORST_PLAN = computeDecorPlan(
  {
    table_shape: "mixed",
    centerpiece: "mixed",
    has_stage: true,
    has_arch: true,
    has_entrance_decor: true,
    has_dance_floor: true,
    has_draping: true,
    has_chandeliers: true,
    has_string_lights: true,
    candle_density: "lots",
    floral_density: "lush",
    flowers: ["rose", "hydrangea", "baby_breath", "peony", "orchid", "greenery"],
    linens: "floor_length",
    chair_style: "chiavari",
    questions: [],
  },
  { guestCount: null, size: "large", setting: "tent", market: "EG" },
);
const AR_QUESTIONS = [
  "هل الورود طبيعية أم صناعية، وهل يمكن استبدال الهيدرانجيا بزهور متوفرة محليًا في موعد الحفل؟",
  "ما الذي توفره القاعة بالفعل من طاولات وكراسي ومفارش، وما الذي يلزم استئجاره؟",
  "كم يستغرق تركيب الكوشة والإضاءة، ومتى يمكن البدء في التجهيز يوم الحفل؟",
  "هل تشمل الأسعار النقل والتركيب والفك، أم تحسب منفصلة؟",
  "كيف ستُنفذ الإضاءة المعلقة داخل الخيمة، وهل تحتاج إلى مولد كهرباء إضافي؟",
];

describe.skipIf(process.env.LOOKBOOK_PREVIEW !== "1")("lookbook preview", () => {
  it("writes ar and en PDFs", async () => {
    currentMessages = arMessages as unknown as typeof enMessages;
    const arHtml = await renderLookbookHtml(
      { ...data, decorPlan: { plan: WORST_PLAN, questions: AR_QUESTIONS } },
      "ar",
    );
    // The HTML too, so single pages can be screenshotted in a browser.
    await writeFile(`${OUT}/lookbook-ar.html`, arHtml);
    await writeFile(`${OUT}/lookbook-ar.pdf`, await htmlToPdf(arHtml));
    currentMessages = enMessages;
    const enHtml = await renderLookbookHtml(
      {
        ...data,
        recipientName: "Mohamed & Layla",
        design: {
          ...data.design,
          name: "Garden at dusk",
          style_notes: "Candlelight, long tables, nothing symmetrical.",
        },
        decorPlan: { plan: WORST_PLAN, questions: [] },
      },
      "en",
    );
    await writeFile(`${OUT}/lookbook-en.html`, enHtml);
    await writeFile(`${OUT}/lookbook-en.pdf`, await htmlToPdf(enHtml));
  }, 120_000);
});
