import { notFound } from "next/navigation";
import { PlannersBrowseClient } from "./planners-browse-client";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { isFlagEnabled } from "@/lib/flags";
import { openGraphLocaleFields } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  // When the public browse surface is gated off we return `noindex` metadata
  // instead of the SEO-rich version, so even a stale crawl doesn't reward
  // hits on this URL.
  if (!isFlagEnabled("publicBrowse")) {
    return { robots: { index: false, follow: false } };
  }
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("browse"),
  ]);
  return {
    title: `${t("plannersTitle")} · Zaffa`,
    description: t("plannersSubtitle"),
    alternates: { canonical: "/planners" },
    openGraph: {
      title: t("plannersTitle"),
      description: t("plannersSubtitle"),
      type: "website",
      // `openGraph` is replaced wholesale by Next, so the locale fields do
      // not survive from the root layout and have to be spread in per page.
      ...openGraphLocaleFields(locale),
    },
  };
}

export default function PlannersPage() {
  if (!isFlagEnabled("publicBrowse")) notFound();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <PlannersBrowseClient />
      </main>
      <Footer />
    </div>
  );
}
