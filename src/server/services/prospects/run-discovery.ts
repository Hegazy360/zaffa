// Worker that takes a queued DiscoveryRun row and processes it end-to-end:
//
//   1. Pull raw rows from the chosen source (Tavily / Apify / scraper).
//   2. Send each row's text through the LLM extractor for structured data.
//   3. Dedup against existing Prospect rows.
//   4. Upsert / create Prospect rows linked to this run.
//   5. Tally counts on the run row, mark completed.
//
// On any failure we set the run to `failed` with the error message so the
// admin UI can surface it. Each source returns a uniform shape so adding
// new ones (Phase 4 Apify, Phase 5 directory scrapers) is plug-and-play.

import { prisma } from "@/lib/prisma";
import {
  DiscoveryRunStatus,
  Prisma,
  ProspectSource,
  ProspectStatus,
  ProspectType,
} from "@/generated/prisma/client";
import { extractContact, expandQueryVariants } from "./llm";
import { findDuplicate, Normalize } from "./dedup";
import { tavilyDiscover } from "./sources/tavily";
import { instagramDiscover } from "./sources/apify-instagram";
import { tiktokDiscover } from "./sources/apify-tiktok";
import { facebookDiscover } from "./sources/apify-facebook";
import { zafafDiscover } from "./sources/zafaf";
import { weddingfulDiscover } from "./sources/weddingful";
import type { RawRow } from "./sources/types";

// Discovery "depth" — admin-tunable knob that scales per-source limits and
// optionally fans a single query out into LLM-generated variants. Higher
// depth = more API spend + more LLM calls in exchange for broader coverage.
export type DiscoveryDepth = "quick" | "standard" | "deep";

interface DepthLimits {
  web: number;            // Tavily results per call
  webVariants: number;    // # of LLM-generated query variants to also run
  igPosts: number;        // Apify IG resultsLimit per URL
  igVariants: number;     // # of LLM-generated extra hashtags/handles
  ttVideos: number;       // Apify TikTok resultsPerPage
  ttVariants: number;     // # of LLM-generated extra TikTok queries
  fbPages: number;        // Apify FB maxPages
  fbVariants: number;     // # of LLM-generated extra FB search queries
  directoryItems: number; // per-category cap for zafaf / generic
  directoryPages: number; // zafaf pagination depth
}

const DEPTH: Record<DiscoveryDepth, DepthLimits> = {
  quick: {
    web: 10,
    webVariants: 0,
    igPosts: 30,
    igVariants: 0,
    ttVideos: 30,
    ttVariants: 0,
    fbPages: 15,
    fbVariants: 0,
    directoryItems: 20,
    directoryPages: 1,
  },
  standard: {
    web: 20,
    webVariants: 0,
    igPosts: 60,
    igVariants: 0,
    ttVideos: 50,
    ttVariants: 0,
    fbPages: 30,
    fbVariants: 0,
    directoryItems: 40,
    directoryPages: 2,
  },
  deep: {
    web: 20,
    webVariants: 4, // 1 base + 4 variants = 5 Tavily calls = up to 100 results
    igPosts: 200,
    igVariants: 5, // free-tier IG actor caps hashtag pages, so we fan out
    ttVideos: 200,
    ttVariants: 4,
    fbPages: 100,
    fbVariants: 4,
    directoryItems: 200,
    directoryPages: 5,
  },
};

// Helper: best-effort LLM expansion that swallows errors so a transient
// LLM failure doesn't abort the whole discovery run.
async function tryExpand(
  query: string,
  source: string,
  count: number,
): Promise<string[]> {
  if (count <= 0) return [];
  try {
    return await expandQueryVariants({ query, source, count });
  } catch (err) {
    console.error("[discovery] expandQueryVariants failed:", err);
    return [];
  }
}

// "When did we last successfully scrape this exact (source, query)?"
// We use that timestamp as Apify's `onlyPostsNewerThan` cursor so each
// run focuses on creators with fresh posts since we last looked. Cursors
// older than 60 days are ignored (we'd rather rescan than miss content).
const IG_CURSOR_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

async function getInstagramCursor(
  source: ProspectSource,
  query: string,
): Promise<Date | undefined> {
  const since = new Date(Date.now() - IG_CURSOR_MAX_AGE_MS);
  const last = await prisma.discoveryRun.findFirst({
    where: {
      source,
      query,
      status: DiscoveryRunStatus.completed,
      started_at: { gte: since, not: null },
    },
    orderBy: { started_at: "desc" },
    select: { started_at: true },
  });
  return last?.started_at ?? undefined;
}

// Lower-cased set of every handle we already know about for a given
// social source. The IG/TikTok snowball passes use this to avoid spending
// Apify credits re-scraping prospects we already have. Capped to 5k rows
// since beyond that the per-call payload starts to matter; any miss just
// means an occasional duplicate Apify hit, which the upsert layer handles
// cleanly.
async function getKnownSocialHandles(
  source: ProspectSource,
): Promise<string[]> {
  // We pull from two columns:
  //   - `handle` for prospects whose primary source matches.
  //   - the per-network column (`instagram`/`tiktok`) for prospects
  //     captured from another source but whose contact card includes a
  //     handle on this network.
  const handleField = source === ProspectSource.instagram
    ? "instagram"
    : source === ProspectSource.tiktok
      ? "tiktok"
      : null;
  const rows = await prisma.prospect.findMany({
    where: {
      OR: [
        { source, handle: { not: null } },
        ...(handleField ? [{ [handleField]: { not: null } } as const] : []),
      ],
    },
    select: { handle: true, instagram: true, tiktok: true },
    take: 5000,
  });
  const set = new Set<string>();
  for (const r of rows) {
    if (r.handle) set.add(r.handle.toLowerCase());
    const cross =
      handleField === "instagram"
        ? r.instagram
        : handleField === "tiktok"
          ? r.tiktok
          : null;
    if (cross) set.add(cross.toLowerCase().replace(/^@/, ""));
  }
  return Array.from(set);
}

async function fetchRows(
  source: ProspectSource,
  query: string,
  queryType: string,
  depth: DiscoveryDepth,
): Promise<RawRow[]> {
  const limits = DEPTH[depth];
  switch (source) {
    case ProspectSource.web: {
      // Tavily caps at 20 results per call — to go deeper we generate
      // LLM-driven query variants and union the results, deduping by URL.
      const queries = [query, ...(await tryExpand(query, "web", limits.webVariants))];
      const seen = new Set<string>();
      const rows: RawRow[] = [];
      for (const q of queries) {
        try {
          const results = await tavilyDiscover({ query: q, maxResults: limits.web });
          for (const r of results) {
            const id = r.url.slice(0, 200);
            if (seen.has(id)) continue;
            seen.add(id);
            rows.push({
              source_id: id,
              source_url: r.url,
              display_name: r.title.slice(0, 200),
              bio: null,
              text: `Query: ${q}\n\n${r.title}\n\n${r.content}`,
              raw: { ...r, _query: q },
            });
          }
        } catch (err) {
          console.error(`[discovery] tavily "${q}" failed:`, err);
        }
      }
      return rows;
    }
    case ProspectSource.instagram: {
      // Apify's free-tier IG actor caps each hashtag at one page (~18
      // posts), so the only way past that ceiling is to scrape several
      // related hashtag URLs. The actor accepts a list, so this is a
      // single billed run regardless of how many hashtags we add.
      //
      // To keep finding NEW prospects on repeat runs we layer two tricks:
      //   1. `onlyPostsNewerThan` — pulls only posts since our last run,
      //      so quick/standard keep surfacing freshly-active creators
      //      without paying to re-scan the same hashtag page.
      //   2. mention-snowball — second profile-mode pass on `@mentions`
      //      harvested from primary captions, with `excludeHandles`
      //      filtering out leads already in our DB. This naturally
      //      rotates through the long tail of cross-tagged vendors
      //      across consecutive runs.
      //
      // Deep mode intentionally SKIPS the cursor: combined with the
      // exclude-list it produces a self-rotating discovery loop where
      // each successive run consumes ~25 more cross-tagged vendors from
      // the same set of hashtag pages, instead of seeing the same 4
      // top-of-page accounts every time.
      const extras = await tryExpand(query, "instagram", limits.igVariants);
      const [cursor, excludeHandles] = await Promise.all([
        depth === "deep"
          ? Promise.resolve(undefined)
          : getInstagramCursor(source, query),
        getKnownSocialHandles(source),
      ]);
      return instagramDiscover({
        query,
        type: queryType === "hashtag" ? "hashtag" : "search",
        resultsLimit: limits.igPosts,
        extraQueries: extras,
        onlyPostsNewerThan: cursor,
        mentionEnrich: depth === "deep" ? 25 : depth === "standard" ? 8 : 0,
        excludeHandles,
      });
    }
    case ProspectSource.tiktok: {
      // Same self-rotating loop as IG — see its branch for the rationale.
      // TikTok's hashtag/search modes don't accept a date cursor, but the
      // snowball pass (profile mode) does, so we feed the cursor to that
      // pass to keep it focused on recent activity. The exclude-list is
      // what makes consecutive runs find new prospects from the same
      // hashtag/search results.
      const extras = await tryExpand(query, "tiktok", limits.ttVariants);
      const excludeHandles = await getKnownSocialHandles(source);
      // Cursor for the snowball's profile scrape: we only care about the
      // last ~3 months of activity from each cross-tagged creator.
      const ttSnowballCursor = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000,
      );
      return tiktokDiscover({
        query,
        resultsLimit: limits.ttVideos,
        extraQueries: extras,
        mentionEnrich: depth === "deep" ? 25 : depth === "standard" ? 8 : 0,
        excludeHandles,
        onlyPostsNewerThan: ttSnowballCursor,
      });
    }
    case ProspectSource.facebook: {
      // Facebook scraper takes a single startUrl per call, so we fan the
      // variants into N sequential adapter calls and union the results.
      const extras = await tryExpand(query, "facebook", limits.fbVariants);
      const all = [query, ...extras];
      const seen = new Set<string>();
      const rows: RawRow[] = [];
      for (const q of all) {
        try {
          const got = await facebookDiscover({ query: q, resultsLimit: limits.fbPages });
          for (const r of got) {
            const k = r.source_id;
            if (seen.has(k)) continue;
            seen.add(k);
            rows.push(r);
          }
        } catch (err) {
          console.error(`[discovery] facebook "${q}" failed:`, err);
        }
      }
      return rows;
    }
    case ProspectSource.directory: {
      // Two flavors:
      //   query_type=zafaf      → zafaf adapter (zafaf.net subdomains)
      //   query_type=url        → generic listing-page scraper (any URL)
      // For backwards compat: if the query starts with http(s):// or
      // "url:", treat it as a generic listing URL even when query_type is
      // something else.
      const kind = queryType.toLowerCase();
      const looksLikeUrl =
        /^https?:\/\//i.test(query) || query.toLowerCase().startsWith("url:");
      if (looksLikeUrl)
        return weddingfulDiscover({ query, maxItems: limits.directoryItems });
      if (kind === "url")
        return weddingfulDiscover({ query, maxItems: limits.directoryItems });
      // Default: zafaf. Accepts category keywords like "photographer" or
      // exact slugs like "photographers-and-videographers", with optional
      // `country:saudi-arabia <keyword>` prefix.
      return zafafDiscover({
        query,
        maxItems: limits.directoryItems,
        maxPages: limits.directoryPages,
      });
    }
    case ProspectSource.manual:
      throw new Error("Manual source can't be discovered automatically");
  }
}

// Rate-limit safety: refuse to spin up another run for the same
// (source, query) inside the cooldown window. We trust the DB for state
// (no Redis dep) — completed/running rows from the recent past block.
const COOLDOWN_MS = 15 * 60 * 1000;

async function isOnCooldown(
  runId: string,
  source: ProspectSource,
  query: string,
  depth: string,
): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_MS);
  const recent = await prisma.discoveryRun.findFirst({
    where: {
      id: { not: runId },
      source,
      query,
      depth,
      status: { in: [DiscoveryRunStatus.completed, DiscoveryRunStatus.running] },
      created_at: { gte: since },
    },
    select: { id: true },
  });
  return recent != null;
}

export interface RunDiscoveryResult {
  prospectsFound: number;
  prospectsNew: number;
}

export interface RunDiscoveryOptions {
  // Skip the per-(source, query, depth) cooldown. Admin-initiated retries
  // pass this — the cooldown only exists to keep the cron from hammering
  // sources, not to block deliberate human action.
  bypassCooldown?: boolean;
}

export async function runDiscovery(
  runId: string,
  options: RunDiscoveryOptions = {},
): Promise<RunDiscoveryResult> {
  const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`DiscoveryRun ${runId} not found`);
  if (run.status !== DiscoveryRunStatus.queued) {
    // Already in flight or done — bail.
    return {
      prospectsFound: run.prospects_found,
      prospectsNew: run.prospects_new,
    };
  }

  if (
    !options.bypassCooldown &&
    (await isOnCooldown(runId, run.source, run.query, run.depth))
  ) {
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: DiscoveryRunStatus.failed,
        completed_at: new Date(),
        error: `Cooldown: another run for this (source, query) completed recently. Try again in ~15 minutes.`,
      },
    });
    return { prospectsFound: 0, prospectsNew: 0 };
  }

  await prisma.discoveryRun.update({
    where: { id: runId },
    data: {
      status: DiscoveryRunStatus.running,
      started_at: new Date(),
    },
  });

  try {
    const depth: DiscoveryDepth =
      run.depth === "quick" || run.depth === "deep" ? run.depth : "standard";
    const rows = await fetchRows(run.source, run.query, run.query_type, depth);
    let newCount = 0;
    for (const row of rows) {
      try {
        const extracted = await extractContact({
          text: row.text,
          hint: {
            handle: row.handle ?? undefined,
            followers: row.followers ?? undefined,
            source: run.source,
          },
        });
        const identity = {
          email: extracted.email,
          whatsapp: extracted.whatsapp,
          phone: extracted.phone,
          instagram: extracted.instagram ?? row.handle ?? null,
          facebook: extracted.facebook,
          tiktok: extracted.tiktok,
        };
        const dupeId = await findDuplicate(identity);
        if (dupeId) {
          // Touch last_seen_at so admins can see the lead is still alive.
          await prisma.prospect.update({
            where: { id: dupeId },
            data: { last_seen_at: new Date() },
          });
          continue;
        }
        // (source, source_id) uniqueness — we may also have seen this exact
        // url in a prior run; upsert handles that.
        await prisma.prospect.upsert({
          where: {
            source_source_id: {
              source: run.source,
              source_id: row.source_id,
            },
          },
          update: {
            last_seen_at: new Date(),
            qualifying_score: extracted.qualifying_score,
            // Refresh fields if the new pull had stronger data.
            email: extracted.email ?? undefined,
            whatsapp: extracted.whatsapp ?? undefined,
            phone: extracted.phone ?? undefined,
            instagram: Normalize.handle(extracted.instagram ?? row.handle) ?? undefined,
            facebook: Normalize.handle(extracted.facebook) ?? undefined,
            tiktok: Normalize.handle(extracted.tiktok) ?? undefined,
            website: extracted.website ?? undefined,
            city: extracted.city ?? undefined,
            bio: row.bio ?? extracted.summary ?? undefined,
            vendor_category: extracted.vendor_category ?? undefined,
            prospect_type:
              extracted.prospect_type !== ProspectType.unknown
                ? extracted.prospect_type
                : undefined,
          },
          create: {
            source: run.source,
            source_id: row.source_id,
            source_url: row.source_url ?? null,
            display_name: row.display_name,
            handle: Normalize.handle(row.handle) ?? null,
            prospect_type: extracted.prospect_type,
            vendor_category: extracted.vendor_category ?? null,
            email: Normalize.email(extracted.email),
            whatsapp: Normalize.phone(extracted.whatsapp),
            phone: Normalize.phone(extracted.phone),
            instagram: Normalize.handle(extracted.instagram ?? row.handle),
            facebook: Normalize.handle(extracted.facebook),
            tiktok: Normalize.handle(extracted.tiktok),
            website: extracted.website,
            bio: row.bio ?? extracted.summary,
            city: extracted.city,
            country: "EG",
            followers: row.followers ?? null,
            avatar_url: row.avatar_url ?? null,
            qualifying_score: extracted.qualifying_score,
            status: ProspectStatus.new,
            raw_payload: row.raw as Prisma.InputJsonValue,
            discovery_run_id: runId,
            last_seen_at: new Date(),
          },
        });
        newCount += 1;
      } catch (rowErr) {
        // One bad row shouldn't kill the whole run.
        console.error(`[discovery ${runId}] row failed:`, rowErr);
      }
    }

    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: DiscoveryRunStatus.completed,
        completed_at: new Date(),
        prospects_found: rows.length,
        prospects_new: newCount,
      },
    });

    return { prospectsFound: rows.length, prospectsNew: newCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: DiscoveryRunStatus.failed,
        completed_at: new Date(),
        error: message.slice(0, 1000),
      },
    });
    throw err;
  }
}
