// Facebook source (Apify). `apify/facebook-pages-scraper` accepts a list of
// page URLs / search terms and returns metadata. We use the search variant
// here so admins can pass free-text queries; per-page deep-dives can be
// added later.

import { runActorSync } from "./apify";
import type { RawRow } from "./types";

interface FbPage {
  pageId?: string | number;
  name?: string;
  url?: string;
  username?: string;
  about?: string;
  intro?: string;
  email?: string;
  phone?: string;
  websites?: string[];
  city?: string;
  region?: string;
  country?: string;
  followers?: number;
  likes?: number;
  profilePic?: string;
}

export interface FacebookDiscoverInput {
  query: string;
  resultsLimit?: number;
}

export async function facebookDiscover(
  input: FacebookDiscoverInput,
): Promise<RawRow[]> {
  // Facebook has multiple actors. We use the pages scraper with a search
  // term, which Apify exposes as `startUrls` containing search URLs.
  const searchUrl = `https://www.facebook.com/search/pages?q=${encodeURIComponent(input.query)}`;
  const items = (await runActorSync({
    actor: "apify/facebook-pages-scraper",
    maxItems: 100,
    input: {
      startUrls: [{ url: searchUrl }],
      maxPages: input.resultsLimit ?? 30,
    },
  })) as FbPage[];

  const out: RawRow[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const id = String(it.pageId ?? it.url ?? it.name ?? "").slice(0, 200);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = it.name ?? it.username ?? "Unnamed page";
    const text = [
      `Facebook ${it.url ?? ""}`,
      name,
      it.intro ?? "",
      it.about ?? "",
      it.email ? `email: ${it.email}` : "",
      it.phone ? `phone: ${it.phone}` : "",
      it.websites?.length ? `websites: ${it.websites.join(", ")}` : "",
      [it.city, it.region, it.country].filter(Boolean).join(", "),
    ]
      .filter(Boolean)
      .join("\n");
    out.push({
      source_id: id,
      source_url: it.url ?? null,
      display_name: name,
      handle: it.username ?? null,
      bio: it.about ?? it.intro ?? null,
      text,
      followers: it.followers ?? it.likes ?? null,
      avatar_url: it.profilePic ?? null,
      raw: it as unknown,
    });
  }
  return out;
}
