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

import { runActorSync } from "./apify";
import type { RawRow } from "./types";

interface IgItem {
  ownerUsername?: string;
  ownerFullName?: string;
  ownerId?: string | number;
  url?: string;
  caption?: string;
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
  latestPosts?: Array<{ caption?: string }>;
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
}

function buildUrl(query: string, kind: "hashtag" | "search"): string {
  const cleaned = query.replace(/^[#@]/, "").trim();
  if (kind === "hashtag") {
    // Instagram normalizes hashtags to lowercase ASCII.
    return `https://www.instagram.com/explore/tags/${encodeURIComponent(cleaned.toLowerCase())}/`;
  }
  // For a free-text "search" we treat the query as a username/handle.
  // (apify/instagram-scraper has no real keyword search; if the admin wants
  // keyword discovery they should use Tavily's web source instead.)
  return `https://www.instagram.com/${encodeURIComponent(cleaned)}/`;
}

export async function instagramDiscover(
  input: InstagramDiscoverInput,
): Promise<RawRow[]> {
  const kind = input.type ?? "hashtag";
  const allQueries = [input.query, ...(input.extraQueries ?? [])];
  const seenUrl = new Set<string>();
  const directUrls: string[] = [];
  for (const q of allQueries) {
    const url = buildUrl(q, kind);
    if (seenUrl.has(url)) continue;
    seenUrl.add(url);
    directUrls.push(url);
  }
  const resultsLimit = input.resultsLimit ?? (kind === "hashtag" ? 60 : 30);

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
    },
  })) as IgItem[];

  const byUser = new Map<string, RawRow>();
  for (const it of items) {
    // Hashtag/posts results use ownerUsername; profile/details results use
    // a top-level `username`. Handle both.
    const username =
      it.owner?.username ?? it.ownerUsername ?? it.username ?? null;
    if (!username) continue;
    if (byUser.has(username)) continue;
    const owner = it.owner ?? {};
    const fullName =
      owner.fullName ?? it.ownerFullName ?? it.fullName ?? username;
    const sourceId = String(
      owner.id ?? it.ownerId ?? username,
    );
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
    byUser.set(username, {
      source_id: sourceId,
      source_url: `https://instagram.com/${username}`,
      display_name: fullName,
      handle: username,
      bio,
      text,
      followers,
      avatar_url: avatar,
      raw: it as unknown,
    });
  }
  return Array.from(byUser.values());
}
