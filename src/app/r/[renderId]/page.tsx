import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { openGraphLocaleFields } from "@/i18n/config";
import { RenderRevealClient } from "./reveal-client";

/**
 * Server wrapper for the magic-link reveal page.
 *
 * The reveal itself has to be a client component — it reads the Supabase
 * session that `verifyOtp` just established, and drives the paywall — and a
 * client component cannot export `generateMetadata`. So this route had no
 * title, no description, no `og:locale`, and, more importantly, **no
 * `noindex`**: a private render page that search engines were free to crawl if
 * a link ever leaked into one.
 *
 * The wrapper is the whole fix. The client half moved to `reveal-client.tsx`
 * unchanged.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("visionPack"),
  ]);
  const title = t("revealMetaTitle");
  const description = t("revealMetaDescription");
  return {
    title,
    description,
    // Per-visitor, magic-link gated, and behind an email confirmation. Nothing
    // here should ever be in an index.
    robots: { index: false, follow: false, nocache: true },
    openGraph: {
      title,
      description,
      type: "website",
      ...openGraphLocaleFields(locale),
    },
  };
}

export default function RenderRevealPage({
  params,
}: {
  params: Promise<{ renderId: string }>;
}) {
  return <RenderRevealClient params={params} />;
}
