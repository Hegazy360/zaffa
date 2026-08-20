import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sizeFromGuestCount, type Size } from "@/types/venue-designer";

/**
 * Anonymized teaser for an open brief. Designed to be public-safe: every
 * identifying field (couple's name, exact date, venue, budget, exact title,
 * references, style notes) is stripped before it leaves the server. Budget
 * isn't exposed even as a coarse band, couples don't want their spend
 * tier visible to anonymous visitors. What remains is enough to make a
 * planner curious and a client believe the platform is busy, and nothing
 * more.
 */
export interface PublicBriefTeaser {
  id: string;
  event_type: string;
  /** ISO date string of the first of the event's month, or null if no date set. */
  event_month: string | null;
  guest_band: Size | null;
  /** First 3 colors from the design's palette, for visual flavor. */
  palette: string[];
  /** Cloudinary URL of the AI render. The client always shows it blurred. */
  hero_image: string | null;
}

export interface MarketplaceTeaserData {
  /** Total count of open briefs. The teaser cards are a sample of these. */
  total_open: number;
  /** Total couples in the design phase right now (open briefs + drafts). */
  total_active: number;
  teasers: PublicBriefTeaser[];
}

const MAX_TEASERS = 6;

/**
 * How long to cache the teaser between recomputes. Matches the page's ISR
 * window so dev (where ISR is bypassed) and prod (where ISR holds) end up
 * with roughly the same DB hit rate. Bump in lockstep with `revalidate` on
 * the consuming pages.
 */
const CACHE_TTL_SECONDS = 300;
const CACHE_KEY = ["marketplace-teaser", "v1"] as const;
export const MARKETPLACE_TEASER_CACHE_TAG = "marketplace-teaser";

function paletteColors(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.colors)) return [];
  return obj.colors
    .filter((c): c is string => typeof c === "string")
    .slice(0, 3);
}

function eventMonthIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  // First-of-month, the consumer formats the month/year locale-aware. Using
  // an ISO date keeps the wire payload stable.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/**
 * Underlying read. Issues exactly two DB round-trips:
 *   1. A single aggregate query computing both teaser counts via FILTER.
 *   2. The findMany for the visible cards.
 * Both are independent best-effort marketing numbers (no invariant to
 * protect), so we fire them concurrently. Wrapped by `fetchMarketplaceTeaser`
 * which adds the data-cache layer; do not call this directly from pages.
 */
async function fetchMarketplaceTeaserUncached(): Promise<MarketplaceTeaserData> {
  try {
    const [counts, openBriefs] = await Promise.all([
      // One round-trip for both counts. `COUNT(*) FILTER (...)` is a
      // standard SQL aggregate that lets us compute conditional counts in
      // a single pass over `events`, instead of paying two separate index
      // scans + RTTs. EXISTS subqueries hit the (event_id, approved_at)
      // composite index on `venue_designs`.
      prisma.$queryRaw<
        { open_count: bigint; active_count: bigint }[]
      >`
        SELECT
          COUNT(*) FILTER (
            WHERE planner_id IS NULL
              AND EXISTS (
                SELECT 1
                FROM venue_designs d
                WHERE d.event_id = e.id
                  AND d.approved_at IS NOT NULL
              )
          ) AS open_count,
          COUNT(*) FILTER (
            WHERE status::text IN ('draft', 'planning')
              AND (
                planner_id IS NULL
                OR EXISTS (
                  SELECT 1
                  FROM venue_designs d
                  WHERE d.event_id = e.id
                )
              )
          ) AS active_count
        FROM events e
      `,
      prisma.event.findMany({
        where: {
          planner_id: null,
          designs: { some: { approved_at: { not: null } } },
        },
        orderBy: [{ created_at: "desc" }],
        take: MAX_TEASERS,
        select: {
          id: true,
          event_type: true,
          event_date: true,
          designs: {
            where: { approved_at: { not: null } },
            orderBy: { approved_at: "desc" },
            take: 1,
            // The marketing surface deliberately reads only `media[0].url`
            //, every render uploaded through the AI pipeline lives in
            // Cloudinary, so we get a stable CDN URL we can safely embed
            // and cache. The legacy `thumbnail` column on `venue_designs`
            // can hold inline `data:` URIs from a removed write path; we
            // ignore it here so a few dirty rows can't bloat the payload
            // (or blow past `unstable_cache`'s 2 MB ceiling) for everyone.
            select: {
              palette: true,
              size: true,
              guest_count: true,
              media: {
                where: { type: "render" },
                orderBy: { created_at: "desc" },
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      }),
    ]);

    const row = counts[0];
    const openCount = row ? Number(row.open_count) : 0;
    const activeCount = row ? Number(row.active_count) : 0;

    const teasers: PublicBriefTeaser[] = openBriefs.map((e) => {
      const design = e.designs[0];
      const heroImage = design?.media[0]?.url ?? null;
      const guestBand: Size | null = design
        ? design.guest_count != null
          ? sizeFromGuestCount(design.guest_count)
          : ((design.size as Size | null) ?? null)
        : null;
      return {
        id: e.id,
        event_type: e.event_type,
        event_month: eventMonthIso(e.event_date),
        guest_band: guestBand,
        palette: paletteColors(design?.palette),
        hero_image: heroImage,
      };
    });

    return {
      total_open: openCount,
      total_active: activeCount,
      teasers,
    };
  } catch (err) {
    // The marketing surfaces are public, never let a DB hiccup kill the
    // page. The component degrades to its empty state. Logged so the
    // failure is debuggable: silent fallbacks are exactly what made
    // a Prisma TLS regression look like "the events list just disappeared"
    // for several minutes (until the cached empty payload also expired).
    console.error("[marketplace-teaser] DB read failed; serving empty state", err);
    return { total_open: 0, total_active: 0, teasers: [] };
  }
}

/**
 * Cached fetcher for the anonymized teaser shown on the marketing home and
 * planner sign-up pages. Backed by Next's data cache so concurrent renders
 * (and dev hits, where ISR doesn't apply) share one DB round-trip per
 * `CACHE_TTL_SECONDS`. Tag with `MARKETPLACE_TEASER_CACHE_TAG` to bust on
 * relevant writes if we ever need real-time freshness.
 */
export const fetchMarketplaceTeaser: () => Promise<MarketplaceTeaserData> =
  unstable_cache(fetchMarketplaceTeaserUncached, [...CACHE_KEY], {
    revalidate: CACHE_TTL_SECONDS,
    tags: [MARKETPLACE_TEASER_CACHE_TAG],
  });
