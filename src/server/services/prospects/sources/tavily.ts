// Tavily web search adapter. Returns an array of `{ url, title, content }`
// rows. We use Tavily because it's the cheapest legitimate source we can
// wire — 1k free searches/month and a clean JSON API. Docs:
// https://docs.tavily.com/

export interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score?: number;
}

export interface TavilyDiscoverInput {
  query: string;
  maxResults?: number;
  // Restrict to certain domains, useful when we want to bias towards
  // Egyptian directories or social platforms we haven't built dedicated
  // scrapers for yet.
  includeDomains?: string[];
  excludeDomains?: string[];
}

export async function tavilyDiscover(
  input: TavilyDiscoverInput,
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is required for Tavily discovery");
  }
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: input.query,
      // "advanced" gives us the page snippet we feed to the LLM.
      search_depth: "advanced",
      max_results: Math.min(20, Math.max(1, input.maxResults ?? 10)),
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      include_domains: input.includeDomains,
      exclude_domains: input.excludeDomains ?? [
        // Cut down on the obvious spam hits.
        "linkedin.com",
        "youtube.com",
        "pinterest.com",
        "amazon.com",
        "wikipedia.org",
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}
