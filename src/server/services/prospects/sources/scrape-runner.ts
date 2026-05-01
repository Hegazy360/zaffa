// Lightweight cheerio-based scraping helpers shared by every directory
// adapter. We deliberately avoid Playwright to keep the deploy footprint
// small (Playwright pulls a 300 MB Chromium download on Vercel).
//
// If a future directory needs JS rendering, swap in `apify/web-scraper`
// and add it as a separate adapter rather than expanding this runner.

import * as cheerio from "cheerio";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: DEFAULT_HEADERS, redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Scraper ${url} → ${res.status}`);
  }
  return await res.text();
}

export function load(html: string) {
  return cheerio.load(html);
}

// Extract a phone number / email from arbitrary text using regex. Cheap
// pre-pass before we hand off to the LLM normalizer.
export function regexExtract(text: string): {
  emails: string[];
  phones: string[];
} {
  const emails = Array.from(
    text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi),
  ).map((m) => m[0]);
  const phones = Array.from(
    text.matchAll(/\+?\d[\d\s().-]{7,}\d/g),
  ).map((m) => m[0]);
  return {
    emails: Array.from(new Set(emails)).slice(0, 5),
    phones: Array.from(new Set(phones)).slice(0, 5),
  };
}

// Polite delay between same-host requests so we don't hammer small
// directories. Caller is responsible for passing the previous timestamp;
// returns an updated timestamp.
export async function politeWait(prevAt: number, minIntervalMs = 1500): Promise<number> {
  const wait = Math.max(0, prevAt + minIntervalMs - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return Date.now();
}
