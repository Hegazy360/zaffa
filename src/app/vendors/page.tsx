import { notFound } from "next/navigation";
import { VendorsBrowseClient } from "./vendors-browse-client";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { isFlagEnabled } from "@/lib/flags";
import { openGraphLocaleFields } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  if (!isFlagEnabled("publicBrowse")) {
    return { robots: { index: false, follow: false } };
  }
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("browse"),
  ]);
  return {
    title: `${t("vendorsTitle")} · Zaffa`,
    description: t("vendorsSubtitle"),
    alternates: { canonical: "/vendors" },
    openGraph: {
      title: t("vendorsTitle"),
      description: t("vendorsSubtitle"),
      type: "website",
      // `openGraph` is replaced wholesale by Next, so the locale fields do
      // not survive from the root layout and have to be spread in per page.
      ...openGraphLocaleFields(locale),
    },
  };
}

export default function VendorsPage() {
  if (!isFlagEnabled("publicBrowse")) notFound();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <VendorsBrowseClient />
      </main>
      <Footer />
    </div>
  );
}
