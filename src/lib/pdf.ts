import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * HTML → PDF, through headless Chromium.
 *
 * This replaces `@react-pdf/renderer` for the lookbook, and the reason is not
 * aesthetic. react-pdf **cannot shape Arabic**: a torture test (ZAF-61) showed
 * joined words rendering malformed, the lam-alef ligature mangled, and stray
 * Latin glyphs — ®, Ä, Œ — substituted where Arabic letters belong. Isolated
 * letters, which need no shaping, came out fine, which rules out the font and
 * points squarely at the text engine. The lookbook is a *paid* artefact in a
 * market that reads Arabic, so that is not a defect we can style around.
 *
 * Chromium shapes Arabic, does bidi, and handles RTL layout correctly, for
 * free — and it is the same engine the microsite already renders in, so the
 * PDF can look like the product rather than like a second implementation of
 * it.
 *
 * The cost is honest and worth stating: a cold start of a few seconds on the
 * first download after idle. For an artefact somebody paid for and downloads
 * once, that is the right trade.
 */

/** Fonts are read off disk and inlined, never fetched. See `fontFaceCss`. */
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

const FACES = [
  { file: "fraunces-300.ttf", family: "Fraunces", weight: 300 },
  { file: "inter-400.ttf", family: "Inter", weight: 400 },
  { file: "inter-600.ttf", family: "Inter", weight: 600 },
  { file: "cairo-400.ttf", family: "Cairo", weight: 400 },
  { file: "cairo-600.ttf", family: "Cairo", weight: 600 },
] as const;

let cachedFontCss: string | null = null;

/**
 * `@font-face` rules with the font data inlined as base64.
 *
 * The previous implementation fetched fonts from jsDelivr at render time. In a
 * paid artefact that is a live dependency on a third party: a CDN blip does
 * not degrade the PDF, it silently swaps every glyph for Helvetica — and for
 * Arabic, Helvetica has no glyphs at all, so it produces tofu. Inlining also
 * means the function needs no network access to render, which is what makes
 * "works offline" testable rather than aspirational.
 *
 * Cached per process: five files, read once per warm instance.
 */
export async function fontFaceCss(): Promise<string> {
  if (cachedFontCss) return cachedFontCss;
  const rules = await Promise.all(
    FACES.map(async ({ file, family, weight }) => {
      const data = await readFile(path.join(FONT_DIR, file));
      return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/ttf;base64,${data.toString("base64")}) format("truetype")}`;
    }),
  );
  cachedFontCss = rules.join("");
  return cachedFontCss;
}

/**
 * Render a complete HTML document to a PDF buffer.
 *
 * Local development uses whatever Chrome is installed; production uses the
 * bundled `@sparticuz/chromium` build, which is the one that fits and runs in
 * a serverless function.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer-core");

  const isLocal = process.env.NODE_ENV !== "production";
  let executablePath: string;
  let args: string[];
  let headless: boolean | "shell";

  if (isLocal) {
    executablePath =
      process.env.CHROME_EXECUTABLE_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    args = ["--no-sandbox", "--disable-dev-shm-usage"];
    headless = true;
  } else {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
    // The package dropped its `headless` export; there is one mode now.
    headless = true;
  }

  const browser = await puppeteer.default.launch({
    executablePath,
    args,
    headless,
    // The lookbook is A4 portrait; the viewport only affects layout of
    // anything sized in viewport units, which the template avoids.
    defaultViewport: { width: 1240, height: 1754 },
  });

  try {
    const page = await browser.newPage();
    // `networkidle0` would wait for requests the document does not make — the
    // fonts are inlined and the images are remote but preloaded by the
    // template, so `load` plus an explicit image wait is both faster and more
    // deterministic.
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise<void>((resolve) => {
                // Resolve on error too: one unreachable render must not cost
                // the customer the whole document they paid for.
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
          ),
      );
    });

    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
