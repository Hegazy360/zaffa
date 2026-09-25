import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { openGraphLocaleFields } from "@/i18n/config";
import { isFlagEnabled } from "@/lib/flags";
import { loadSharePayload } from "@/server/services/design-shares";
import { FamilyVoteClient } from "./family-vote-client";

// Read on every request: a revoked link must stop showing the design the
// moment the couple revokes it, not when a cache expires.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

async function loadLive(token: string) {
  if (!isFlagEnabled("familyShare")) return null;
  return loadSharePayload(token);
}

/**
 * F6, "Ask your family": `/s/<token>`, the page a couple's family opens from
 * WhatsApp to vote for a version.
 *
 * Private by link, so never indexed. Public in the sense that matters: no
 * session, and the middleware leaves `/s/` alone, so a visitor is never
 * minted an anonymous account for looking.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const [locale, t, payload] = await Promise.all([
    getLocale(),
    getTranslations("familyShare"),
    loadLive(token),
  ]);
  const name = payload?.coupleName;
  const title = name ? t("pageTitleNamed", { name }) : t("pageTitle");
  const description = t("metaDescription");
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/s/${token}`,
      ...openGraphLocaleFields(locale),
      // No `images`: the `opengraph-image.tsx` beside this file is the card,
      // watermarked and sized for WhatsApp.
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function FamilySharePage({ params }: PageProps) {
  const { token } = await params;
  const enabled = isFlagEnabled("familyShare");
  const initial = enabled ? await loadSharePayload(token) : null;
  return <FamilyVoteClient token={token} initial={initial} enabled={enabled} />;
}
