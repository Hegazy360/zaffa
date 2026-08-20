import { test, expect } from "@playwright/test";

/**
 * The share cards, on the surfaces that actually get shared.
 *
 * The growth loop for this product is a link pasted into WhatsApp, and a
 * broken OG image fails silently: the page still works, the preview just goes
 * blank, and nobody notices for weeks. These assertions are the only thing
 * that would catch it.
 *
 * Two failure modes this guards specifically:
 *
 *  1. **The fonts vanish in production.** The cards read font files off disk,
 *     which Next's tracer cannot follow through `path.join(process.cwd(), …)`.
 *     Without `outputFileTracingIncludes` they are pruned from the deployment
 *     and every card 500s — while working perfectly in dev.
 *  2. **The preview exceeds WhatsApp's fetch limit.** WhatsApp declines
 *     preview images much above ~300 KB. The microsite card composes a
 *     photograph, which came out at 1 MB as PNG before it was re-encoded —
 *     and the first re-encoder (`sharp`) failed in production only, so the
 *     card silently fell back to the 1 MB PNG. Hence the byte ceiling here.
 */

const MAX_PREVIEW_BYTES = 300 * 1024;

for (const locale of ["en", "ar"] as const) {
  test.describe(`share cards [${locale}]`, () => {
    test.beforeEach(async ({ context, baseURL }) => {
      const url = new URL(baseURL!);
      await context.addCookies([
        { name: "zaffa_locale", value: locale, domain: url.hostname, path: "/" },
      ]);
    });

    test("the homepage declares a card and the card resolves", async ({
      page,
      request,
    }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const src = await page
        .locator('meta[property="og:image"]')
        .first()
        .getAttribute("content");
      expect(src, "the homepage must declare an og:image").toBeTruthy();

      const res = await request.get(src!);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("image");
      const body = await res.body();
      expect(body.byteLength).toBeGreaterThan(1000);
      expect(body.byteLength).toBeLessThan(MAX_PREVIEW_BYTES);
    });

    test("the microsite card is re-encoded and stays under the limit", async ({
      request,
    }) => {
      // The photographic card is the one that cannot be served as PNG. If the
      // encoder ever silently falls back — which is exactly what happened in
      // production once — the content-type flips to image/png and the size
      // blows past the ceiling. Both are asserted.
      const res = await request.get(
        "/v/pwvtun6cvc/opengraph-image",
      );
      // A microsite that no longer exists is not this test's business.
      test.skip(res.status() === 404, "seed microsite is not published");
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/jpeg");
      expect((await res.body()).byteLength).toBeLessThan(MAX_PREVIEW_BYTES);
    });

    test("the reveal page's card is generic, not the render", async ({
      request,
    }) => {
      // `/r/[renderId]` is behind a magic link. Its card must never compose the
      // render: link previews are fetched and cached by every server the link
      // passes through, so a private image would leak the moment the email was
      // forwarded. The card is therefore byte-identical to the root card.
      const [root, reveal] = await Promise.all([
        request.get("/opengraph-image"),
        request.get("/r/00000000-0000-0000-0000-000000000000/opengraph-image"),
      ]);
      expect(root.status()).toBe(200);
      expect(reveal.status()).toBe(200);
      expect((await reveal.body()).equals(await root.body())).toBe(true);
    });
  });
}
