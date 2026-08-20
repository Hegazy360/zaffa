import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Check } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { openGraphLocaleFields } from "@/i18n/config";
import { isFlagEnabled } from "@/lib/flags";
import { formatCount, formatMoney } from "@/lib/money-format";
import { VISION_PACK_COUNTRY_COOKIE } from "@/lib/vision-pack-pricing";
import { pricedMarkets, quoteGuidanceFor } from "@/lib/concierge-pricing";
import { MarketSwitcher } from "./_components/market-switcher";
import { jsonLdScript, serviceLd } from "@/lib/structured-data";
import { WhatsAppCta } from "@/components/marketing/whatsapp-cta";
import { REPLY_WITHIN_HOURS } from "@/lib/contact-channels";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("marketing.pricing");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/pricing" },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      url: "/pricing",
      type: "website",
      ...openGraphLocaleFields(locale),
    },
  };
}

/**
 * What we charge.
 *
 * The reversal of "you won't find a single price on this page". The research
 * behind it and the literal copy are in `docs/pricing-published-2026-08.md`;
 * the numbers come from `concierge-pricing.ts`, which the admin quote panel
 * and the intake wizard read from too, so the three can never disagree.
 *
 * Indexable on purpose. Most of the measured lift from published pricing is a
 * search-visibility effect, which only lands if the page can be found.
 *
 * Country comes from the same `zaffa_country` cookie the packs use, and the
 * switcher is a link, not a client-side selector — a market's prices should
 * be a URL you can send to your fiancé.
 */

/** Vercel's placeholders for "we could not tell", not countries. */
const UNKNOWN_ORIGINS = new Set(["XX", "T1"]);

function normaliseCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.toUpperCase();
  if (code.length !== 2 || UNKNOWN_ORIGINS.has(code)) return null;
  return code;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>;
}) {
  // The flag is a cohort control, not a kill switch — but if it is off, the
  // page must not exist rather than render an empty table.
  if (!isFlagEnabled("publishedPricing")) notFound();

  const [jar, params, locale, t, tw] = await Promise.all([
    cookies(),
    searchParams,
    getLocale(),
    getTranslations("marketing.pricing"),
    getTranslations("marketing.wholeWedding"),
  ]);
  const tWa = await getTranslations("whatsapp");

  const markets = pricedMarkets();
  // An explicit ?market= wins over the cookie: the switcher and a shared link
  // have to beat geo-detection, or the page argues with its own reader.
  const requested = normaliseCountry(params.market);
  const detected = normaliseCountry(jar.get(VISION_PACK_COUNTRY_COOKIE)?.value);
  const selected =
    requested && markets.includes(requested)
      ? requested
      : detected && markets.includes(detected)
        ? detected
        : // Gulf-first: every enquiry so far has come from it, so it is the
          // right default for a visitor we cannot place.
          "AE";

  const guidance = quoteGuidanceFor(selected)!;
  // Region names come from the runtime rather than a fifth copy of the world
  // in `messages/`. Falls back to the ISO code, which is still correct.
  let regionName = selected;
  try {
    regionName = new Intl.DisplayNames([locale], { type: "region" }).of(selected) ?? selected;
  } catch {
    /* no region data — the code stands in */
  }
  const money = (amount: number) =>
    formatMoney(amount, guidance.currency, locale);

  // The visitor is in a market we have no table for. They still see a real
  // table (so the model is legible) plus an explicit note that theirs is
  // quoted individually — never a converted number, never a refusal.
  const isUnpricedVisitor = Boolean(detected) && !markets.includes(detected!);

  // The worked example is pinned to Dubai in AED, whichever market's table is
  // showing. It names a city and quotes a band position, so formatting it in
  // the selected currency would produce "a wedding in Dubai... EGP 380,000" —
  // and the band it cites is the second one only in the UAE ladder. An
  // illustration that is explicitly about one city is clearer than one that
  // silently re-denominates itself.
  const EXAMPLE_CURRENCY = "AED";
  const example = {
    budget: formatMoney(380_000, EXAMPLE_CURRENCY, locale),
    fee: formatMoney(45_000, EXAMPLE_CURRENCY, locale),
  };

  // Service + Offer, so the fee is legible to search engines rather than
  // living only in a <table> nobody parses. `Offer` is only ever emitted here,
  // where the exact figures are printed on the page beside it — markup that
  // states a price the visitor cannot see is what gets penalised.
  const jsonLd = {
    ...serviceLd({
      name: tw("eyebrow"),
      description: tw("tagline"),
      areaServed: markets,
    }),
    offers: guidance.bands.map((band) => ({
      "@type": "Offer",
      price: band.fee,
      priceCurrency: guidance.currency,
      description: `${band.budgetFrom}–${band.budgetTo} ${guidance.currency}`,
    })),
  };

  const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
  // Step numbers are ordinals, not money, so they take Eastern Arabic
  // numerals in ar — matching the prose around them. Only fees are pinned to
  // Latin digits. See `uiLocaleTag` for why the raw locale is not enough.

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <main className="flex-1">
        {/* The number */}
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grain-bg opacity-30"
          />
          <div className="relative mx-auto max-w-3xl px-4 py-16 sm:py-20">
            <header className="mx-auto max-w-xl text-center">
              <p className="text-xs uppercase tracking-[0.28em] text-rose-700 rtl:tracking-normal">
                {t("eyebrow")}
              </p>
              <h1 className="mt-3 font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
                {t("title")}
              </h1>
              <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
                {t("subtitle")}
              </p>
            </header>

            <div className="mt-10">
              <MarketSwitcher
                markets={markets}
                selected={selected}
                label={t("marketLabel")}
              />
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-rose-100 bg-white/70">
              <table className="w-full text-start">
                {/* A caption naming the market, not repeating the headline —
                    a screen reader announcing "Here is our number" twice tells
                    you nothing about what the table contains. */}
                <caption className="sr-only">
                  {t("tableCaption", { market: regionName })}
                </caption>
                <thead>
                  <tr className="border-b border-rose-100 bg-rose-50/40 text-xs uppercase tracking-wider text-muted-foreground rtl:tracking-normal">
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("tableBudget")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-end font-medium">
                      {t("tableFee")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {guidance.bands.map((band) => (
                    <tr key={band.fee}>
                      <td className="px-5 py-4 text-sm">
                        {/* bdi so the bidi algorithm cannot pull the dash or a
                            neighbouring letter into the numbers in Arabic. */}
                        <bdi>
                          {money(band.budgetFrom)} – {money(band.budgetTo)}
                        </bdi>
                      </td>
                      <td className="px-5 py-4 text-end font-display text-xl">
                        <bdi>{money(band.fee)}</bdi>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-5 py-4 text-sm">{t("bespokeRow")}</td>
                    <td className="px-5 py-4 text-end text-sm text-muted-foreground">
                      {t("bespokeFee")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {t("capNote", { amount: money(guidance.cap) })}
            </p>
            <p className="mt-4 text-pretty text-sm text-muted-foreground">
              {t("vendorNote")}
            </p>

            {isUnpricedVisitor && (
              <div className="mt-8 rounded-2xl border border-rose-200/70 bg-rose-50/50 p-5">
                <h2 className="font-display text-lg font-light tracking-tight">
                  {t("unpricedTitle")}
                </h2>
                <p className="mt-2 text-pretty text-sm text-muted-foreground">
                  {t("unpricedBody")}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* The worked example */}
        <section className="border-t border-rose-100/70 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
              {t("exampleTitle")}
            </h2>
            <div className="mt-6 space-y-4 rounded-2xl border border-rose-100 bg-white/70 p-6 text-pretty text-sm leading-relaxed sm:text-base">
              <p className="font-medium">
                {t("exampleSetup", { amount: example.budget })}
              </p>
              <p>{t("exampleFee", { amount: example.fee })}</p>
              <p>{t("exampleVendors", { amount: example.budget })}</p>
              <p className="text-muted-foreground">{t("exampleSplit")}</p>
            </div>
          </div>
        </section>

        {/* The guarantee, with its limit in the same block — never apart */}
        <section className="border-t border-rose-100/70 bg-rose-50/30 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="flex items-center gap-2 font-display text-2xl font-light tracking-tight sm:text-3xl">
              <Check className="size-5 shrink-0 text-rose-600" aria-hidden />
              {t("guaranteeTitle")}
            </h2>
            <p className="mt-4 max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t("guaranteeBody")}
            </p>
          </div>
        </section>

        {/* How we run it — process as the substitute for a portfolio */}
        <section className="border-t border-rose-100/70 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
              {t("weekTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("weekSubtitle")}
            </p>
            <ol className="mt-8 space-y-6">
              {weeks.map((n, i) => (
                <li key={n} className="flex gap-4">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-rose-100 font-display text-sm text-rose-700"
                  >
                    {formatCount(i + 1, locale)}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-medium">{t(`week${n}Title`)}</h3>
                    <p className="mt-1 text-pretty text-sm text-muted-foreground">
                      {t(`week${n}Body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-rose-100/70 bg-gradient-to-b from-background to-rose-50/40 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
              {t("ctaTitle")}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{t("ctaBody")}</p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                variant="cta"
                size="xl"
                render={<Link href="/enquire" />}
                className="group w-full sm:w-auto sm:px-8"
              >
                {t("cta")}
                <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Button>
              {/* Someone who has just read the fee and wants to talk about it
                  should not have to fill in a wizard first. */}
              <WhatsAppCta
                surface="pricing"
                variant="outline"
                className="w-full sm:w-auto"
              />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {tWa("replyPromise", { hours: REPLY_WITHIN_HOURS })}
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
