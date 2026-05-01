// TikTok source (Apify). We use the free `clockworks/free-tiktok-scraper`
// which accepts search keywords / hashtags and returns video items with
// author profile info. As with IG, we collapse back to unique creators.

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
}

export interface TikTokDiscoverInput {
  query: string;
  resultsLimit?: number;
  // Additional related queries / hashtags to scrape in the same actor run.
  // The TikTok actor accepts arrays of both, so fanning out is free.
  extraQueries?: string[];
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
    const handle = it.authorMeta?.name;
    if (!handle) continue;
    if (byUser.has(handle)) continue;
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
    byUser.set(handle, {
      source_id: String(author.id ?? handle),
      source_url: `https://tiktok.com/@${handle}`,
      display_name: display,
      handle,
      bio: author.signature ?? null,
      text,
      followers: author.fans ?? null,
      avatar_url: author.avatar ?? null,
      raw: it as unknown,
    });
  }
  return Array.from(byUser.values());
}
