import "server-only";
import { prisma } from "@/lib/prisma";
import { sizeFromGuestCount, type Size } from "@/types/venue-designer";

/**
 * Anonymized teaser for an open brief. Designed to be public-safe: every
 * identifying field (couple's name, exact date, venue, budget, exact title,
 * references, style notes) is stripped before it leaves the server. Budget
 * isn't exposed even as a coarse band — couples don't want their spend
 * tier visible to anonymous visitors. What remains is enough to make a
 * planner curious and a client believe the platform is busy — and nothing
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
  // First-of-month — the consumer formats the month/year locale-aware. Using
  // an ISO date keeps the wire payload stable.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/**
 * Fetch the anonymized teaser data shown on the marketing home page and the
 * planner sign-up page. Falls back to an empty result on any DB error so the
 * marketing pages never blow up because of an outage.
 */
export async function fetchMarketplaceTeaser(): Promise<MarketplaceTeaserData> {
  try {
    // These three reads are independent best-effort marketing numbers — no
    // invariant to protect — so we issue them concurrently on separate
    // connections instead of serializing them inside an interactive
    // transaction. On a remote (eu-west) DB this turns 3× round-trip
    // latency into 1×.
    const [openCount, activeCount, openBriefs] = await Promise.all([
      prisma.event.count({
        where: {
          planner_id: null,
          designs: { some: { approved_at: { not: null } } },
        },
      }),
      // Anyone designing right now: open briefs + couples still iterating
      // on a design. This is the "platform is buzzing" number on the home
      // page; deliberately broader than `openCount` so it includes drafts.
      prisma.event.count({
        where: {
          OR: [
            { planner_id: null },
            { designs: { some: {} } },
          ],
          status: { in: ["draft", "planning"] },
        },
      }),
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
            select: {
              palette: true,
              thumbnail: true,
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

    const teasers: PublicBriefTeaser[] = openBriefs.map((e) => {
      const design = e.designs[0];
      const heroImage =
        design?.media[0]?.url ?? design?.thumbnail ?? null;
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
  } catch {
    // The marketing surfaces are public — never let a DB hiccup kill the
    // page. The component degrades to its empty state.
    return { total_open: 0, total_active: 0, teasers: [] };
  }
}
