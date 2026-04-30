/**
 * Server-side client for our zaffa-pinterest-search Cloudflare Worker.
 *
 * The Worker proxies Pinterest's undocumented BaseSearchResource endpoint and
 * returns normalized pin objects. We use it (rather than calling Pinterest
 * directly) because Vercel's AWS egress is heavily blocked by Pinterest.
 *
 * Required env:
 *   PINTEREST_PROXY_URL    e.g. https://zaffa-pinterest-search.<acct>.workers.dev
 *   PINTEREST_PROXY_SECRET shared secret matching the Worker's PROXY_SECRET
 */

export interface PinterestPin {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  description: string;
  link: string | null;
  pinUrl: string;
  pinner?: { username: string; full_name?: string };
  dominantColor?: string;
}

export interface PinterestSearchResult {
  query: string;
  results: PinterestPin[];
}

interface WorkerResponse {
  query?: string;
  results?: PinterestPin[];
  error?: string;
  message?: string;
  status?: number;
}

export class PinterestSearchError extends Error {
  constructor(
    message: string,
    public readonly cause?: { status?: number; code?: string }
  ) {
    super(message);
    this.name = "PinterestSearchError";
  }
}

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

export async function searchPinterest(input: {
  query: string;
  pageSize?: number;
}): Promise<PinterestSearchResult> {
  const proxyUrl = process.env.PINTEREST_PROXY_URL;
  const proxySecret = process.env.PINTEREST_PROXY_SECRET;

  if (!proxyUrl || !proxySecret) {
    throw new PinterestSearchError(
      "Pinterest search is not configured. Set PINTEREST_PROXY_URL and PINTEREST_PROXY_SECRET in .env.local."
    );
  }

  const query = input.query.trim();
  if (!query) {
    throw new PinterestSearchError("Search query cannot be empty.");
  }

  const pageSize = Math.max(
    1,
    Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  );

  const url = new URL("/search", proxyUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(pageSize));

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${proxySecret}`,
      },
      // Avoid Next.js fetch caching since the Worker's CF edge already caches.
      cache: "no-store",
    });
  } catch (err) {
    throw new PinterestSearchError(
      "Pinterest proxy unreachable.",
      { code: err instanceof Error ? err.message : "fetch_failed" }
    );
  }

  let payload: WorkerResponse;
  try {
    payload = (await response.json()) as WorkerResponse;
  } catch {
    throw new PinterestSearchError(
      `Pinterest proxy returned non-JSON (status ${response.status}).`,
      { status: response.status }
    );
  }

  if (!response.ok || payload.error) {
    throw new PinterestSearchError(
      payload.message ?? payload.error ?? `Search failed (${response.status}).`,
      { status: response.status, code: payload.error }
    );
  }

  return {
    query: payload.query ?? query,
    results: payload.results ?? [],
  };
}
