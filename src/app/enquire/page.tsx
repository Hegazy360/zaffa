import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { EnquireWizard } from "@/components/enquire/enquire-wizard";
import { openGraphLocaleFields } from "@/i18n/config";
import { VISION_PACK_COUNTRY_COOKIE } from "@/lib/vision-pack-pricing";
import { isFlagEnabled } from "@/lib/flags";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("enquire");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/enquire" },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      url: "/enquire",
      type: "website",
      ...openGraphLocaleFields(locale),
    },
  };
}

/**
 * Intake for the full-service plan.
 *
 * Server component so the country can be prefilled from the same
 * `zaffa_country` cookie that drives per-country pack pricing — the visitor
 * should not have to tell us where they are when we already know. Everything
 * interactive lives in the client wizard.
 *
 * Deliberately not auth-gated: `enquiries.submit` is a public procedure and
 * the middleware only mints a Supabase user on the designer and dashboard
 * routes, so a cold visitor arriving from the homepage can still reach us.
 */
export default async function EnquirePage({
  searchParams,
}: {
  searchParams: Promise<{ designId?: string }>;
}) {
  const [jar, params, t] = await Promise.all([
    cookies(),
    searchParams,
    getTranslations("enquire"),
  ]);
  const country = jar.get(VISION_PACK_COUNTRY_COOKIE)?.value?.toUpperCase() ?? null;
  // Normalised the same way the pricing resolver does — `XX`/`T1` are
  // Vercel's "unknown origin" placeholders, not countries.
  const initialCountry =
    country && country.length === 2 && !["XX", "T1"].includes(country)
      ? country
      : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grain-bg opacity-30"
          />
          <div className="relative mx-auto max-w-3xl px-4 py-16 sm:py-20">
            <header className="mx-auto mb-10 max-w-xl text-center">
              <p className="text-xs text-eyebrow text-rose-700">
                {t("eyebrow")}
              </p>
              <h1 className="mt-3 font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
                {t("title")}
              </h1>
              <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
                {t("subtitle")}
              </p>
            </header>
            <EnquireWizard
              showPricingLink={isFlagEnabled("publishedPricing")}
              initialCountry={initialCountry}
              designId={params.designId ?? null}
            />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
