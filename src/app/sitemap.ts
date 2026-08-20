import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { isFlagEnabled } from "@/lib/flags";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.zaffa.ai"
  );
}

// Re-fetch the dynamic catalog at most once an hour. Vendor / planner
// profiles aren't time-sensitive, and we don't want to hit Prisma every
// time a crawler touches `/sitemap.xml`.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const includeBrowse = isFlagEnabled("publicBrowse");

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...(includeBrowse
      ? ([
          {
            url: `${base}/planners`,
            lastModified: now,
            changeFrequency: "daily" as const,
            priority: 0.9,
          },
          {
            url: `${base}/vendors`,
            lastModified: now,
            changeFrequency: "daily" as const,
            priority: 0.9,
          },
        ] satisfies MetadataRoute.Sitemap)
      : []),
    // Published pricing is a search-visibility play as much as a trust one —
    // most of the measured lift from showing rates comes from being findable,
    // so this entry is load-bearing rather than housekeeping.
    ...(isFlagEnabled("publishedPricing")
      ? ([
          {
            url: `${base}/pricing`,
            lastModified: now,
            changeFrequency: "monthly" as const,
            priority: 0.9,
          },
        ] satisfies MetadataRoute.Sitemap)
      : []),
    // The gallery is the only public surface showing real customer work, so
    // it is the strongest indexable page after the homepage.
    { url: `${base}/gallery`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Skip the catalog fetch entirely when public browse is gated off — those
  // URLs 404, so listing them in the sitemap would just waste crawl budget.
  if (!includeBrowse) return staticEntries;

  let dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const [planners, vendors] = await Promise.all([
      prisma.plannerProfile.findMany({
        select: { id: true, updated_at: true },
        orderBy: { updated_at: "desc" },
        take: 1000,
      }),
      prisma.vendorProfile.findMany({
        select: { id: true, updated_at: true },
        orderBy: { updated_at: "desc" },
        take: 1000,
      }),
    ]);

    dynamicEntries = [
      ...planners.map((p) => ({
        url: `${base}/planners/${p.id}`,
        lastModified: p.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...vendors.map((v) => ({
        url: `${base}/vendors/${v.id}`,
        lastModified: v.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    // If the database is unreachable at build/preview time, fall back to
    // just the static entries instead of failing the route entirely.
    dynamicEntries = [];
  }

  return [...staticEntries, ...dynamicEntries];
}
