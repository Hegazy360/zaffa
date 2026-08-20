import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import {
  VISION_PACK_COUNTRY_COOKIE,
  formatPriceLabel,
  normalizeCountryCode,
} from "@/lib/vision-pack-pricing";
import { resolveVisionPackPricing } from "@/server/services/vision-pack-pricing";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Microsite } from "./microsite-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Loads the public microsite payload for `/v/<slug>`. Public — no auth,
 * no per-request cookies. Returns null when the slug doesn't resolve to
 * an active/fulfilled pack.
 */
async function loadMicrosite(slug: string) {
  const pack = await prisma.visionPack.findUnique({
    where: { microsite_slug: slug },
    select: {
      id: true,
      status: true,
      microsite_published_at: true,
      microsite_public: true,
      renders_used: true,
      videos_used: true,
      recipient_user_id: true,
      recipient: {
        select: { id: true, full_name: true, avatar_url: true },
      },
    },
  });
  if (!pack) return null;
  if (pack.status !== "active" && pack.status !== "fulfilled") return null;
  if (!pack.recipient) return null;
  if (!pack.microsite_published_at) return null;

  // Use the most-recently-touched design owned by the recipient. In v1
  // every recipient has at most a small handful of designs; we pick the
  // latest as their "current vision".
  const design = await prisma.venueDesign.findFirst({
    where: { user_id: pack.recipient.id },
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      name: true,
      event_type: true,
      setting: true,
      size: true,
      palette: true,
      references: true,
      style_notes: true,
      thumbnail: true,
      media: {
        orderBy: { created_at: "desc" },
        select: { id: true, type: true, url: true, parent_id: true },
      },
    },
  });

  return {
    pack: {
      publishedAt: pack.microsite_published_at,
      isPublic: pack.microsite_public,
      rendersGenerated: pack.renders_used,
      videosGenerated: pack.videos_used,
    },
    recipient: pack.recipient,
    design,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadMicrosite(slug);
  if (!data) {
    return { robots: { index: false, follow: false } };
  }
  const t = await getTranslations("visionPack");
  const recipientName = data.recipient.full_name ?? "Our wedding";
  const title = t("micrositeShareTitle", { names: recipientName });
  const description = t("micrositeShareDescription", { names: recipientName });
  return {
    title,
    description,
    alternates: { canonical: `/v/${slug}` },
    // Microsite is public-by-link; index only when the recipient has
    // explicitly opted into the public gallery feed.
    robots: data.pack.isPublic
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: `/v/${slug}`,
      type: "article",
      // No `images` here on purpose. Setting them would override the
      // `opengraph-image.tsx` file convention in this folder, which is what
      // used to happen: the share preview was the raw full-resolution
      // Cloudinary render — a megabyte or more, unbranded, and routinely
      // cropped by the chat client into a meaningless slice of a table.
      // WhatsApp also declines to fetch preview images much over ~300 KB, so
      // the most-shared surface in the product often previewed as nothing.
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function MicrositePage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadMicrosite(slug);
  if (!data) notFound();

  // Resolve the visitor's market price for the "create yours" CTA.
  // Microsite pages are slug-keyed and not statically generated, so
  // reading geo headers here doesn't disrupt any caching strategy.
  const cookieStore = await cookies();
  const headerStore = await headers();
  const country =
    normalizeCountryCode(cookieStore.get(VISION_PACK_COUNTRY_COOKIE)?.value) ??
    normalizeCountryCode(headerStore.get("x-vercel-ip-country")) ??
    normalizeCountryCode(headerStore.get("cf-ipcountry"));
  const pricing = await resolveVisionPackPricing(country);
  const priceLabel = formatPriceLabel(pricing);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <Microsite
        slug={slug}
        pack={data.pack}
        recipient={data.recipient}
        design={data.design}
        visionPackPriceLabel={priceLabel}
      />
      <Footer />
    </div>
  );
}
