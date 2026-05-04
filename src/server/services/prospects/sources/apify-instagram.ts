// Instagram source (Apify). We use `apify/instagram-scraper` which accepts
// `directUrls` — a list of full Instagram URLs (hashtag pages, profiles,
// location pages). The legacy `hashtags` / `search` shorthand is silently
// ignored by the current actor version, which manifests as runs that
// terminate in ~3s with 0 items and the actor log message
// "Starting the scraper with 0 direct URL(s)". So we always build URLs
// ourselves.
//
// We collapse the per-post results back to unique authors so each Prospect
// row represents a business, not an individual post.
//
// To break out of the "always-the-same-top-of-page" trap, this module also:
//
//   1. Honours `onlyPostsNewerThan` (a per-(source, query) cursor) so each
//      consecutive run skips posts already seen and surfaces creators
//      posting fresh content.
//   2. Runs an optional **mention-snowball** second pass: extracts
//      `@mentions` / `taggedUsers` from the primary scrape's captions,
//      filters out handles we already have, and runs a profile-details
//      scrape on the top-K. Wedding vendors heavily cross-tag each other,
//      so this typically uncovers prospects that never appear at the top
//      of any hashtag page.

import { runActorSync } from "./apify";
import type { RawRow } from "./types";

interface IgItem {
  ownerUsername?: string;
  ownerFullName?: string;
  ownerId?: string | number;
  url?: string;
  caption?: string;
  timestamp?: string;
  hashtags?: string[];
  mentions?: string[];
  taggedUsers?: Array<{ username?: string; full_name?: string }>;
  // Profile-mode results put the bio fields on the top-level item.
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  profilePicUrl?: string;
  // Some result modes nest the owner under `owner`.
  owner?: {
    username?: string;
    fullName?: string;
    id?: string | number;
    profilePicUrl?: string;
    biography?: string;
    followersCount?: number;
  };
  // latestPosts may exist when resultsType=details
  latestPosts?: Array<{
    caption?: string;
    mentions?: string[];
    taggedUsers?: Array<{ username?: string }>;
  }>;
}

export interface InstagramDiscoverInput {
  // Primary query — either a hashtag (without #) or a username/handle for
  // profile mode. We always pass it; `extraQueries` adds more URLs to the
  // same actor run (no extra cost vs N separate runs).
  query: string;
  type?: "hashtag" | "search";
  // Posts to pull per URL — note: Apify's free-tier hashtag scraper caps
  // at one page (~18 posts), so this only matters for paid plans.
  resultsLimit?: number;
  // Additional related queries to scrape in the same actor invocation.
  // Used by deep mode to fan out across related hashtags (e.g. base
  // `egyptianwedding` → also `egyptbride`, `sahelweddings`, ...).
  extraQueries?: string[];
  // Per-(source, query) cursor. Posts older than this are skipped by the
  // actor. We pass the most recent successful run's `started_at` here so
  // each subsequent run automatically focuses on creators who've posted
  // since we last looked.
  onlyPostsNewerThan?: Date;
  // If > 0, run a second profile-details pass on up to this many handles
  // harvested from `@mentions` / `taggedUsers` in the primary scrape.
  // Deep mode sets this to 25; quick/standard pass 0 (skip).
  mentionEnrich?: number;
  // Handles we already have in our prospect DB. Used to short-circuit the
  // mention-snowball pass so we don't pay Apify to re-scrape known leads.
  // Lower-case, no `@`.
  excludeHandles?: Iterable<string>;
}

// Apify's `apify/instagram-scraper` validates each entry of `directUrls`
// against this regex (and rejects the whole run with a 400 if any entry
// fails). The constraint is on the FIRST path segment after `instagram.com/`,
// so hashtag URLs (which start with `/explore/...`) are always fine, but
// profile URLs must be a valid handle: ASCII letters, digits, `.`, `_`, `-`.
const APIFY_IG_URL_RE =
  /^(https:\/\/)?(www\.)?instagram\.com\/[A-Za-z0-9._-]+(\/.*)?$/;

// IG hashtags accept letters/digits/underscore in any script, but for our
// purposes we strip everything that isn't a Unicode letter/digit or `_` and
// lowercase the rest. Multi-word inputs are concatenated (e.g.
// "cairo wedding" -> "cairowedding") since IG tags can't contain spaces.
function normalizeHashtag(raw: string): string | null {
  const stripped = raw.replace(/^[#@]/, "").trim();
  if (!stripped) return null;
  // \p{L} = letters in any script (covers Arabic/etc.), \p{N} = digits.
  const cleaned = stripped
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, "");
  return cleaned || null;
}

// IG handles are constrained to ASCII letters/digits/dot/underscore. We
// strip a leading `@`, lowercase, and reject anything else so we never
// hand Apify a URL it'll bounce.
function normalizeHandle(raw: string): string | null {
  const stripped = raw.replace(/^[#@]/, "").trim().toLowerCase();
  if (!stripped) return null;
  if (!/^[a-z0-9._]+$/.test(stripped)) return null;
  return stripped;
}

function buildUrl(query: string, kind: "hashtag" | "search"): string | null {
  if (kind === "hashtag") {
    const tag = normalizeHashtag(query);
    if (!tag) return null;
    // The hashtag itself goes inside `(\/.*)?$` so URL-encoded Unicode is
    // fine — Apify's regex only validates the first segment ("explore").
    return `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
  }
  // For a free-text "search" we treat the query as a username/handle.
  // (apify/instagram-scraper has no real keyword search; if the admin wants
  // keyword discovery they should use Tavily's web source instead.)
  const handle = normalizeHandle(query);
  if (!handle) return null;
  const url = `https://www.instagram.com/${handle}/`;
  // Defensive double-check against the actor's own regex.
  return APIFY_IG_URL_RE.test(url) ? url : null;
}

// Convert one IG item (post or profile detail) into a unified RawRow,
// returning null if it doesn't carry enough info to identify an owner.
function igItemToRow(it: IgItem): RawRow | null {
  const username =
    it.owner?.username ?? it.ownerUsername ?? it.username ?? null;
  if (!username) return null;
  const owner = it.owner ?? {};
  const fullName =
    owner.fullName ?? it.ownerFullName ?? it.fullName ?? username;
  const sourceId = String(owner.id ?? it.ownerId ?? username);
  const bio = owner.biography ?? it.biography ?? null;
  const followers = owner.followersCount ?? it.followersCount ?? null;
  const avatar = owner.profilePicUrl ?? it.profilePicUrl ?? null;
  const captions = (it.latestPosts ?? [])
    .map((p) => p.caption ?? "")
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
  const text = [
    `IG @${username}`,
    fullName,
    bio ?? "",
    it.caption ?? "",
    captions,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    source_id: sourceId,
    source_url: `https://instagram.com/${username}`,
    display_name: fullName,
    handle: username,
    bio,
    text,
    followers,
    avatar_url: avatar,
    raw: it as unknown,
  };
}

// Walk every caption / mentions[] / taggedUsers[] in the items and return
// up to `cap` distinct handles, ordered by mention frequency (most-tagged
// first), excluding any in `exclude`.
function harvestMentionHandles(
  items: IgItem[],
  exclude: Set<string>,
  cap: number,
): string[] {
  if (cap <= 0) return [];
  const counts = new Map<string, number>();
  const captionRe = /@([A-Za-z0-9._]+)/g;
  const bump = (raw: string | undefined | null) => {
    if (!raw) return;
    const h = raw.toLowerCase().replace(/^@/, "").trim();
    if (!h || !/^[a-z0-9._]+$/.test(h)) return;
    if (exclude.has(h)) return;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  };
  for (const it of items) {
    for (const m of it.mentions ?? []) bump(m);
    for (const t of it.taggedUsers ?? []) bump(t.username);
    if (it.caption) {
      let m: RegExpExecArray | null;
      while ((m = captionRe.exec(it.caption)) !== null) bump(m[1]);
      captionRe.lastIndex = 0;
    }
    // Profile-details items expose more captions via `latestPosts`.
    for (const p of it.latestPosts ?? []) {
      for (const m of p.mentions ?? []) bump(m);
      for (const t of p.taggedUsers ?? []) bump(t.username);
      if (p.caption) {
        let m: RegExpExecArray | null;
        while ((m = captionRe.exec(p.caption)) !== null) bump(m[1]);
        captionRe.lastIndex = 0;
      }
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([h]) => h);
}

// Apify accepts ISO timestamps OR relative strings ("3 months") for this
// field. We always pass ISO since we have a Date.
function formatNewerThan(d: Date | undefined): string | undefined {
  if (!d) return undefined;
  // Don't accept absurdly-recent cursors (< 5 min ago) — that often means
  // the user hammered the retry button and we'd otherwise return 0 posts
  // for the primary pass and rely entirely on the snowball. Backing off to
  // 5 min ensures the primary scrape still picks up some content.
  const safe = new Date(Math.min(d.getTime(), Date.now() - 5 * 60 * 1000));
  return safe.toISOString();
}

export async function instagramDiscover(
  input: InstagramDiscoverInput,
): Promise<RawRow[]> {
  const kind = input.type ?? "hashtag";
  const allQueries = [input.query, ...(input.extraQueries ?? [])];
  const seenUrl = new Set<string>();
  const directUrls: string[] = [];
  const skipped: string[] = [];
  for (const q of allQueries) {
    const url = buildUrl(q, kind);
    if (!url) {
      skipped.push(q);
      continue;
    }
    if (seenUrl.has(url)) continue;
    seenUrl.add(url);
    directUrls.push(url);
  }
  if (skipped.length) {
    console.warn(
      `[discovery/instagram] skipped ${skipped.length} invalid ${kind} ` +
        `queries: ${skipped.slice(0, 5).join(", ")}` +
        (skipped.length > 5 ? ` (+${skipped.length - 5} more)` : ""),
    );
  }
  if (directUrls.length === 0) {
    throw new Error(
      kind === "search"
        ? `Instagram profile lookup needs a valid handle (letters, digits, "." or "_") — got "${input.query}". Try a hashtag query instead, e.g. "weddingplanneregypt".`
        : `Instagram hashtag lookup got an empty/invalid query: "${input.query}".`,
    );
  }
  const resultsLimit = input.resultsLimit ?? (kind === "hashtag" ? 60 : 30);
  const onlyPostsNewerThan = formatNewerThan(input.onlyPostsNewerThan);

  const items = (await runActorSync({
    actor: "apify/instagram-scraper",
    // Each hashtag yields ~18 posts on free tier; budget enough headroom
    // for all URLs in this single run.
    maxItems: Math.max(50, directUrls.length * Math.max(20, resultsLimit) + 20),
    input: {
      directUrls,
      // `posts` gives us caption + ownerUsername for hashtag pages.
      resultsType: kind === "hashtag" ? "posts" : "details",
      resultsLimit,
      addParentData: false,
      ...(onlyPostsNewerThan ? { onlyPostsNewerThan } : {}),
    },
  })) as IgItem[];

  const byUser = new Map<string, RawRow>();
  for (const it of items) {
    const row = igItemToRow(it);
    if (!row || !row.handle) continue;
    if (byUser.has(row.handle)) continue;
    byUser.set(row.handle, row);
  }

  // Mention-snowball: take handles that surfaced in this run's captions
  // (but aren't yet prospects) and pull their full profiles in a second
  // pass. This is the lever that surfaces NEW leads on subsequent runs
  // even when the hashtag page itself hasn't refreshed.
  const enrichCap = input.mentionEnrich ?? 0;
  if (enrichCap > 0 && items.length > 0) {
    const exclude = new Set<string>(byUser.keys());
    for (const h of input.excludeHandles ?? []) {
      exclude.add(h.toLowerCase());
    }
    // Don't snowball into the queries themselves — they're already in
    // directUrls (or are hashtags, not handles).
    for (const q of allQueries) {
      const h = q.toLowerCase().replace(/^[#@]/, "").trim();
      if (h) exclude.add(h);
    }
    const snowballHandles = harvestMentionHandles(items, exclude, enrichCap);
    if (snowballHandles.length > 0) {
      try {
        const profileUrls = snowballHandles.map(
          (h) => `https://www.instagram.com/${h}/`,
        );
        console.info(
          `[discovery/instagram] snowballing ${snowballHandles.length} ` +
            `mention(s): ${snowballHandles.slice(0, 5).join(", ")}` +
            (snowballHandles.length > 5
              ? ` (+${snowballHandles.length - 5} more)`
              : ""),
        );
        const more = (await runActorSync({
          actor: "apify/instagram-scraper",
          maxItems: snowballHandles.length * 5,
          input: {
            directUrls: profileUrls,
            resultsType: "details",
            // Each profile pulls its bio + a few recent posts (whose
            // captions feed our LLM extractor with extra context).
            resultsLimit: 3,
            addParentData: false,
          },
        })) as IgItem[];
        for (const it of more) {
          const row = igItemToRow(it);
          if (!row || !row.handle) continue;
          if (byUser.has(row.handle)) continue;
          byUser.set(row.handle, row);
        }
      } catch (err) {
        // Snowball failures shouldn't kill the run — the primary results
        // are already collected.
        console.warn(`[discovery/instagram] snowball pass failed:`, err);
      }
    }
  }

  return Array.from(byUser.values());
}
