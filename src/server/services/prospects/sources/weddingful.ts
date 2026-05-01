// Generic listing-page scraper. Pass any URL and we'll try to harvest
// outgoing anchors that look like vendor / business detail pages, fetch
// each one, and return the visible text for the LLM extractor.
//
// This replaces a previous attempt at hardcoded "weddingful / cairoweddings
// / eternalweddings" support — those domains don't exist as wedding
// directories. Instead we expose a flexible URL-driven mode so admins can
// point at any list page they discover (a Google search result, a blog
// "best 10 photographers in cairo" article, an Instagram top-creators
// roundup, …) and have us follow the links.
//
// Usage from the discovery UI:
//   query = "https://example.com/cairo-photographers"
//   query_type = "directory"

import { fetchHtml, load, regexExtract, politeWait } from "./scrape-runner";
import type { RawRow } from "./types";

export interface GenericListingInput {
  // The list page URL we want to harvest links from.
  query: string;
  maxItems?: number;
}

function isLikelyVendorLink(href: string, host: string): boolean {
  // Filter out boilerplate: nav, login, social share, mail, etc.
  const lower = href.toLowerCase();
  if (
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("javascript:") ||
    lower.includes("/login") ||
    lower.includes("/signup") ||
    lower.includes("/cart") ||
    lower.includes("/about") ||
    lower.includes("/contact") ||
    lower.includes("/privacy") ||
    lower.includes("/terms") ||
    lower.includes("/sitemap") ||
    lower.includes("share") ||
    lower.includes("facebook.com/sharer") ||
    lower.includes("twitter.com/intent")
  ) {
    return false;
  }
  // Same-host or social profile links are interesting.
  if (
    lower.includes(host) ||
    lower.includes("instagram.com/") ||
    lower.includes("facebook.com/") ||
    lower.includes("tiktok.com/")
  ) {
    return true;
  }
  return false;
}

export async function genericDirectoryDiscover(
  input: GenericListingInput,
): Promise<RawRow[]> {
  let listUrl = input.query.trim();
  // Strip the optional `url:` prefix some admins paste.
  if (listUrl.toLowerCase().startsWith("url:")) listUrl = listUrl.slice(4).trim();
  if (!/^https?:\/\//.test(listUrl)) {
    throw new Error(
      `Directory query must be a full URL starting with http(s):// — got "${listUrl}".`,
    );
  }

  const parsed = new URL(listUrl);
  const host = parsed.hostname.replace(/^www\./, "");

  const listHtml = await fetchHtml(listUrl);
  const $ = load(listHtml);

  // Collect candidate links. Prefer anchors inside h-tags or list items
  // (a reasonable heuristic for "this is a listing" markup).
  const linkSet = new Set<string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    let abs: string;
    try {
      abs = new URL(href, listUrl).toString();
    } catch {
      return;
    }
    abs = abs.split("#")[0].split("?")[0];
    if (abs === listUrl) return;
    if (!isLikelyVendorLink(abs, host)) return;
    linkSet.add(abs);
  });

  const unique = Array.from(linkSet).slice(0, input.maxItems ?? 25);
  // Empty is a valid result. The page may be JS-rendered or just doesn't
  // match our heuristics — surface that as 0 prospects rather than a hard
  // failure so the admin can move on.
  if (unique.length === 0) return [];

  const out: RawRow[] = [];
  let last = 0;
  for (const url of unique) {
    last = await politeWait(last);
    try {
      const html = await fetchHtml(url);
      const c = load(html);
      const name =
        c("h1").first().text().trim() ||
        c("title").text().trim().split("|")[0]?.trim() ||
        url;
      const description = c("meta[name='description']").attr("content") ?? "";
      const bodyText = c("main").text() || c("body").text();
      const trimmed = bodyText.replace(/\s+/g, " ").trim().slice(0, 4000);
      const { emails, phones } = regexExtract(trimmed);
      const text = [
        `Source: ${listUrl} → ${url}`,
        name,
        description,
        emails.length ? `emails: ${emails.join(", ")}` : "",
        phones.length ? `phones: ${phones.join(", ")}` : "",
        trimmed,
      ]
        .filter(Boolean)
        .join("\n\n");
      out.push({
        source_id: url,
        source_url: url,
        display_name: name,
        bio: description,
        text,
        raw: { url, name, emails, phones } as unknown,
      });
    } catch (err) {
      console.error(`[directory] ${url} failed:`, err);
    }
  }
  return out;
}

// Backwards-compatible alias so the run-discovery dispatcher keeps working
// without renames.
export const weddingfulDiscover = genericDirectoryDiscover;
