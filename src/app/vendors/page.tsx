import { notFound } from "next/navigation";
import { VendorsBrowseClient } from "./vendors-browse-client";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { isFlagEnabled } from "@/lib/flags";

export async function generateMetadata(): Promise<Metadata> {
  if (!isFlagEnabled("publicBrowse")) {
    return { robots: { index: false, follow: false } };
  }
  const t = await getTranslations("browse");
  return {
    title: `${t("vendorsTitle")} · Zaffa`,
    description: t("vendorsSubtitle"),
    alternates: { canonical: "/vendors" },
    openGraph: {
      title: t("vendorsTitle"),
      description: t("vendorsSubtitle"),
      type: "website",
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
