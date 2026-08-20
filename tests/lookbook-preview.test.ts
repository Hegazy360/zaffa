import { describe, it, vi, beforeAll } from "vitest";
import { writeFile } from "node:fs/promises";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";

/**
 * Not an assertion — a generator. Writes the real template through the real
 * Chromium path so the artefact a customer pays for can be looked at, in both
 * directions, rather than inferred from unit tests. Skipped unless
 * `LOOKBOOK_PREVIEW=1`.
 */
const OUT = process.env.LOOKBOOK_PREVIEW_DIR ?? "/tmp";
let currentMessages: typeof enMessages = enMessages;

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => {
    const dict = (currentMessages as unknown as Record<string, unknown>)[ns] as Record<string, unknown>;
    const read = (key: string) =>
      key.split(".").reduce<unknown>((a, p) => (a && typeof a === "object" ? (a as Record<string, unknown>)[p] : undefined), dict);
    const t = (key: string, values?: Record<string, unknown>) => {
      const raw = read(key);
      if (typeof raw !== "string") return key;
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
let htmlToPdf: typeof import("@/lib/pdf").htmlToPdf;
beforeAll(async () => {
  ({ renderLookbookHtml } = await import("@/lib/lookbook-html"));
  ({ htmlToPdf } = await import("@/lib/pdf"));
});

const IMG = "https://res.cloudinary.com/dz0tdjoqj/image/upload/v1778150961/zaffa-renders/juqkmgfqyz4obopj6ihk.jpg";

// Worst-case shape on purpose: every category populated, near the reference
// cap, the full 16-render cap, notes, QR page — the document whose cold
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
  },
};

describe.skipIf(process.env.LOOKBOOK_PREVIEW !== "1")("lookbook preview", () => {
  it("writes ar and en PDFs", async () => {
    currentMessages = arMessages as unknown as typeof enMessages;
    await writeFile(`${OUT}/lookbook-ar.pdf`, await htmlToPdf(await renderLookbookHtml(data, "ar")));
    currentMessages = enMessages;
    await writeFile(
      `${OUT}/lookbook-en.pdf`,
      await htmlToPdf(
        await renderLookbookHtml(
          { ...data, recipientName: "Mohamed & Layla", design: { ...data.design, name: "Garden at dusk", style_notes: "Candlelight, long tables, nothing symmetrical." } },
          "en",
        ),
      ),
    );
  }, 120_000);
});
