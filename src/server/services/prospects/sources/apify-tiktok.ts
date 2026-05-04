// TikTok source (Apify). We use the free `clockworks/free-tiktok-scraper`
// which accepts search keywords / hashtags / profile usernames and returns
// video items with author info. We collapse to unique creators.
//
// Like the IG source, this module runs a self-rotating discovery loop on
// repeat runs:
//
//   1. Primary pass — hashtags + searchQueries. TikTok's hashtag/search
//      modes don't accept a date cursor, so we rely on the exclude-list
//      below to rotate.
//   2. Mention-snowball — extracts `@mentions` and `detailedMentions`
//      from the primary captions, filters out handles we already have,
//      then runs a profile-mode pass on the top-K via `profiles: [...]`
//      with `profileSorting: "latest"` and `oldestPostDateUnified` so
//      we only scan their recent activity.
//
// `excludeHandles` (handles already in our DB) gates the snowball so
// each successive run consumes the next batch of cross-tagged creators
// instead of repeatedly enriching the same top mentions.

import { runActorSync } from "./apify";
import type { RawRow } from "./types";

interface TtItem {
  authorMeta?: {
    name?: string;
    nickName?: string;
    avatar?: string;
    fans?: number;
    signature?: string;
    id?: string;
  };
  text?: string;
  webVideoUrl?: string;
  createTimeISO?: string;
  mentions?: string[];
  detailedMentions?: Array<{ name?: string; username?: string }>;
}

export interface TikTokDiscoverInput {
  query: string;
  resultsLimit?: number;
  // Additional related queries / hashtags to scrape in the same actor run.
  // The TikTok actor accepts arrays of both, so fanning out is free.
  extraQueries?: string[];
  // If > 0, run a second profile-mode pass on up to this many handles
  // harvested from `@mentions` in the primary captions. Deep mode = 25,
  // standard = 8, quick = 0.
  mentionEnrich?: number;
  // Lower-cased handles already in our prospect DB. Used to short-circuit
  // the snowball so we don't pay Apify to re-scrape known leads.
  excludeHandles?: Iterable<string>;
  // Cursor passed to the snowball pass's `oldestPostDateUnified` so the
  // profile scrape only scans recent activity (TikTok's hashtag/search
  // modes ignore this field, but profile mode honours it).
  onlyPostsNewerThan?: Date;
}

// TikTok handles allow letters, digits, `.`, `_`. Same shape as IG.
const TT_HANDLE_RE = /^[a-z0-9._]+$/;

function normalizeTtHandle(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const h = raw.trim().toLowerCase().replace(/^@/, "");
  if (!h || !TT_HANDLE_RE.test(h)) return null;
  return h;
}

function ttItemToRow(it: TtItem): RawRow | null {
  const handle = normalizeTtHandle(it.authorMeta?.name);
  if (!handle) return null;
  const author = it.authorMeta ?? {};
  const display = author.nickName ?? handle;
  const text = [
    `TikTok @${handle}`,
    display,
    author.signature ?? "",
    it.text ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    source_id: String(author.id ?? handle),
    source_url: `https://tiktok.com/@${handle}`,
    display_name: display,
    handle,
    bio: author.signature ?? null,
    text,
    followers: author.fans ?? null,
    avatar_url: author.avatar ?? null,
    raw: it as unknown,
  };
}

// Extract up to `cap` distinct handles from items' captions / mentions /
// detailedMentions, ranked by mention frequency, excluding any in
// `exclude` (already known or already in primary results).
function harvestTtMentions(
  items: TtItem[],
  exclude: Set<string>,
  cap: number,
): string[] {
  if (cap <= 0) return [];
  const counts = new Map<string, number>();
  const captionRe = /@([A-Za-z0-9._]+)/g;
  const bump = (raw: string | undefined | null) => {
    const h = normalizeTtHandle(raw);
    if (!h) return;
    if (exclude.has(h)) return;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  };
  for (const it of items) {
    for (const m of it.mentions ?? []) bump(m);
    for (const dm of it.detailedMentions ?? [])
      bump(dm.username ?? dm.name);
    if (it.text) {
      let m: RegExpExecArray | null;
      while ((m = captionRe.exec(it.text)) !== null) bump(m[1]);
      captionRe.lastIndex = 0;
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([h]) => h);
}

// TikTok actor accepts ISO date or relative ("3 months") here; we send ISO.
function formatNewerThan(d: Date | undefined): string | undefined {
  if (!d) return undefined;
  return new Date(d).toISOString();
}

export async function tiktokDiscover(
  input: TikTokDiscoverInput,
): Promise<RawRow[]> {
  const all = [input.query, ...(input.extraQueries ?? [])];
  const hashtags: string[] = [];
  const searchQueries: string[] = [];
  for (const q of all) {
    const t = q.trim();
    if (!t) continue;
    if (t.startsWith("#")) {
      const h = t.slice(1);
      if (!hashtags.includes(h)) hashtags.push(h);
    } else {
      if (!searchQueries.includes(t)) searchQueries.push(t);
    }
  }
  if (hashtags.length === 0 && searchQueries.length === 0) {
    throw new Error(`TikTok discovery got an empty query: "${input.query}"`);
  }
  const items = (await runActorSync({
    actor: "clockworks/free-tiktok-scraper",
    maxItems: Math.max(50, all.length * 60),
    input: {
      hashtags,
      searchQueries,
      resultsPerPage: input.resultsLimit ?? 50,
    },
  })) as TtItem[];

  const byUser = new Map<string, RawRow>();
  for (const it of items) {
    const row = ttItemToRow(it);
    if (!row || !row.handle) continue;
    if (byUser.has(row.handle)) continue;
    byUser.set(row.handle, row);
  }

  // Mention-snowball: harvest @mentions from primary captions and fetch
  // their full profiles in a second pass. Combined with `excludeHandles`
  // this naturally rotates through the long tail of cross-tagged
  // creators across consecutive runs.
  const enrichCap = input.mentionEnrich ?? 0;
  if (enrichCap > 0 && items.length > 0) {
    const exclude = new Set<string>(byUser.keys());
    for (const h of input.excludeHandles ?? []) {
      const norm = normalizeTtHandle(h);
      if (norm) exclude.add(norm);
    }
    // Don't snowball into the queries themselves.
    for (const q of all) {
      const norm = normalizeTtHandle(q.replace(/^[#@]/, ""));
      if (norm) exclude.add(norm);
    }
    const snowballHandles = harvestTtMentions(items, exclude, enrichCap);
    if (snowballHandles.length > 0) {
      try {
        console.info(
          `[discovery/tiktok] snowballing ${snowballHandles.length} ` +
            `mention(s): ${snowballHandles.slice(0, 5).join(", ")}` +
            (snowballHandles.length > 5
              ? ` (+${snowballHandles.length - 5} more)`
              : ""),
        );
        const oldestPostDateUnified = formatNewerThan(input.onlyPostsNewerThan);
        const more = (await runActorSync({
          actor: "clockworks/free-tiktok-scraper",
          // 5 videos per profile is enough to harvest signature + a few
          // recent captions for the LLM extractor.
          maxItems: snowballHandles.length * 6,
          input: {
            profiles: snowballHandles,
            profileScrapeSections: ["videos"],
            profileSorting: "latest",
            excludePinnedPosts: true,
            resultsPerPage: 5,
            ...(oldestPostDateUnified ? { oldestPostDateUnified } : {}),
          },
        })) as TtItem[];
        for (const it of more) {
          const row = ttItemToRow(it);
          if (!row || !row.handle) continue;
          if (byUser.has(row.handle)) continue;
          byUser.set(row.handle, row);
        }
      } catch (err) {
        console.warn(`[discovery/tiktok] snowball pass failed:`, err);
      }
    }
  }

  return Array.from(byUser.values());
}
