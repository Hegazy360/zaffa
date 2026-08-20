import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Sparkles } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { openGraphLocaleFields } from "@/i18n/config";
import { uiLocaleTag } from "@/lib/money-format";
import { GalleryEmptyCta } from "./empty-cta-client";
import { collectionPageLd, jsonLdScript } from "@/lib/structured-data";

export async function generateMetadata(): Promise<Metadata> {
  // Was a static English object, so an Arabic visitor's share of this page
  // previewed in English and carried no `og:locale` at all. `openGraph` is
  // replaced wholesale by Next, so the locale fields have to be spread in
  // here rather than inherited from the root layout — the exact failure
  // documented in `i18n/config.ts`, which has already shipped once.
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("visionPack"),
  ]);
  return {
    title: t("galleryMetaTitle"),
    description: t("galleryMetaDescription"),
    alternates: { canonical: "/gallery" },
    openGraph: {
      title: t("galleryMetaTitle"),
      description: t("galleryMetaDescription"),
      url: "/gallery",
      type: "website",
      ...openGraphLocaleFields(locale),
    },
  };
}

// ISR: refresh the gallery snapshot every 5 minutes. Public, indexable,
// and cheap to render — a single batched DB hit serves the whole page.
export const revalidate = 300;

interface GalleryItem {
  slug: string;
  publishedAt: Date | null;
  /** Null when the couple has no name on file — the caller localizes the
   *  fallback, which used to be a hardcoded English string. */
  recipientName: string | null;
  heroImage: string | null;
  palette: string[];
  rendersGenerated: number;
}

async function loadGallery(limit = 24): Promise<GalleryItem[]> {
  const packs = await prisma.visionPack.findMany({
    where: {
      microsite_public: true,
      microsite_published_at: { not: null },
      microsite_slug: { not: null },
      status: { in: ["active", "fulfilled"] },
    },
    orderBy: { microsite_published_at: "desc" },
    take: limit,
    select: {
      microsite_slug: true,
      microsite_published_at: true,
      renders_used: true,
      recipient_user_id: true,
      recipient: {
        select: { full_name: true },
      },
    },
  });
  if (packs.length === 0) return [];

  // Batch-fetch the latest render + palette per recipient so the cards
  // can show a real preview. Single grouped query > N+1.
  const recipientIds = packs
    .map((p) => p.recipient_user_id)
    .filter((id): id is string => Boolean(id));
  if (recipientIds.length === 0) return [];

  const designs = await prisma.venueDesign.findMany({
    where: { user_id: { in: recipientIds } },
    orderBy: [{ user_id: "asc" }, { updated_at: "desc" }],
    select: {
      user_id: true,
      palette: true,
      thumbnail: true,
      media: {
        where: { type: "render" },
        orderBy: { created_at: "desc" },
        take: 1,
        select: { url: true },
      },
    },
  });

  // First-seen wins (the orderBy above ensures we encounter each user's
  // most-recent design first).
  const byUser = new Map<string, (typeof designs)[number]>();
  for (const d of designs) {
    if (!byUser.has(d.user_id)) byUser.set(d.user_id, d);
  }

  return packs
    .filter((p) => p.microsite_slug !== null)
    .map((p) => {
      const design = p.recipient_user_id
        ? byUser.get(p.recipient_user_id)
        : null;
      const palette =
        design?.palette &&
        typeof design.palette === "object" &&
        !Array.isArray(design.palette)
          ? (() => {
              const obj = design.palette as { colors?: unknown };
              return Array.isArray(obj.colors)
                ? obj.colors.filter((c): c is string => typeof c === "string")
                : [];
            })()
          : [];
      return {
        slug: p.microsite_slug!,
        publishedAt: p.microsite_published_at,
        recipientName: p.recipient?.full_name ?? null,
        heroImage: design?.media[0]?.url ?? design?.thumbnail ?? null,
        palette,
        rendersGenerated: p.renders_used,
      };
    });
}

export default async function GalleryPage() {
  const items = await loadGallery();
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("visionPack"),
  ]);

  // Dates and counts follow the reader's locale. This was pinned to "en-US",
  // so an Arabic visitor read "Mar 2026" in Latin script on an otherwise
  // Arabic page.
  const monthYear = new Intl.DateTimeFormat(uiLocaleTag(locale), {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      {/* CollectionPage over the microsites actually listed below — the item
          list is built from the same query the page renders, so the markup
          cannot describe a gallery the visitor is not seeing. */}
      {items.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              collectionPageLd({
                name: t("galleryMetaTitle"),
                description: t("galleryMetaDescription"),
                url: "/gallery",
                itemUrls: items.map((i) => `/v/${i.slug}`),
              }),
            ),
          }}
        />
      )}
      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-rose-50/60 via-background to-background pb-12 pt-20 sm:pb-16 sm:pt-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grain-bg opacity-30"
          />
          <div className="relative mx-auto max-w-6xl px-6 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-white/80 px-3 py-1 text-[10px] font-medium tracking-[0.22em] text-rose-700 uppercase backdrop-blur-sm">
              <Sparkles className="size-3" />
              {t("galleryEyebrow")}
            </div>
            <h1 className="font-display mt-5 text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
              {t("galleryTitle")}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-sm text-muted-foreground sm:text-base leading-relaxed">
              {t("gallerySubtitle")}
            </p>
            <div className="mt-7 flex justify-center">
              <Button
                render={<Link href="/venue-designer" />}
                size="lg"
                className="h-11 gap-2 bg-brand-gradient px-5 text-white shadow-glow hover:opacity-90"
              >
                {t("galleryCreateYours")}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rose-200/60 bg-rose-50/40 p-16 text-center">
              <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-rose-100 text-rose-600">
                <Sparkles className="size-6" />
              </div>
              <h2 className="font-display text-2xl font-light tracking-tight">
                {t("galleryEmptyTitle")}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-muted-foreground">
                {t("galleryEmptyBody")}
              </p>
              <div className="champagne-hairline mx-auto mt-6 h-px w-24" aria-hidden />
              <div className="mt-6">
                <GalleryEmptyCta />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const name =
                  item.recipientName ?? t("galleryAnonymousCouple");
                return (
                <Link
                  key={item.slug}
                  href={`/v/${item.slug}`}
                  className="group overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06] transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {item.heroImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.heroImage}
                        alt={name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-50 via-rose-50/60 to-amber-50">
                        <Sparkles className="size-7 text-rose-400" />
                      </div>
                    )}
                    {item.palette.length > 0 && (
                      <span className="absolute start-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-sm">
                        {item.palette.slice(0, 4).map((c) => (
                          <span
                            key={c}
                            className="block size-2 rounded-full ring-1 ring-white/40"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 p-5">
                    <h3 className="font-display text-lg leading-tight font-medium tracking-tight">
                      {name}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {t("galleryRenderCount", {
                        count: item.rendersGenerated,
                      })}
                      {item.publishedAt
                        ? ` · ${monthYear.format(new Date(item.publishedAt))}`
                        : ""}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rose-700">
                      {t("galleryViewMicrosite")}
                      <ArrowRight className="size-3 rtl:-scale-x-100" />
                    </span>
                  </div>
                </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
