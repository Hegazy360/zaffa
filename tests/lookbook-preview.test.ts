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
const data = {
  recipientName: "محمد وليلى",
  publishedAt: new Date("2026-05-07T00:00:00Z"),
  design: {
    name: "حديقة عند الغروب",
    event_type: "wedding",
    setting: "garden",
    size: "medium",
    palette: { colors: ["#e11d48", "#f59e0b", "#1c1917", "#fdf3f0"] },
    references: {
      overall_vibe: [{ id: "a", url: IMG }, { id: "a2", url: IMG }],
      flowers: [{ id: "b", url: IMG }, { id: "c", url: IMG }, { id: "d", url: IMG }],
    },
    style_notes: "شموع، وطاولات طويلة، ولا شيء متماثل.",
    media: [{ id: "r1", type: "render", url: IMG }],
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
