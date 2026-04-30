/**
 * zaffa-pinterest-search
 *
 * Cloudflare Worker that proxies search queries to Pinterest's undocumented
 * BaseSearchResource JSON endpoint and returns a normalized shape.
 *
 * Pinterest now requires a session cookie + CSRF token on resource calls. So
 * the Worker does a two-step fetch:
 *   1. GET /search/pins/?q=<query>  → captures Set-Cookie (csrftoken etc.)
 *   2. GET /resource/BaseSearchResource/get/  with those cookies + X-CSRFToken
 *
 * We cache the final normalized JSON at the Cloudflare edge for 1h, keyed by
 * the full request URL, so repeat queries are essentially free.
 *
 * Auth: requires `Authorization: Bearer ${PROXY_SECRET}` (set via
 * `wrangler secret put PROXY_SECRET`).
 *
 * Endpoint: GET /search?q=<query>&page_size=<1-50>
 *   ↳ { query, results: NormalizedPin[] }
 */

interface Env {
  PROXY_SECRET: string;
}

interface NormalizedPin {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  description: string;
  link: string | null;
  pinUrl: string;
  pinner?: { username: string; full_name?: string };
  dominantColor?: string;
}

interface PinterestImageVariant {
  url: string;
  width?: number;
  height?: number;
}

interface PinterestPin {
  id: string;
  description?: string;
  grid_title?: string;
  title?: string;
  link?: string;
  dominant_color?: string;
  pinner?: { username?: string; full_name?: string };
  images?: Record<string, PinterestImageVariant | undefined>;
}

interface PinterestResponse {
  resource_response?: {
    data?: {
      results?: PinterestPin[];
    };
  };
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const COMMON_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...(init.headers ?? {}),
    },
  });
}

function pickImage(pin: PinterestPin): { full: string; thumb: string } | null {
  const images = pin.images ?? {};
  const orig = images.orig?.url;
  const x736 = images["736x"]?.url;
  const x474 = images["474x"]?.url;
  const x236 = images["236x"]?.url;

  const full = orig ?? x736 ?? x474 ?? x236;
  const thumb = x236 ?? x474 ?? x736 ?? orig;

  if (!full || !thumb) return null;
  return { full, thumb };
}

function normalize(pin: PinterestPin): NormalizedPin | null {
  const img = pickImage(pin);
  if (!img) return null;

  return {
    id: pin.id,
    imageUrl: img.full,
    thumbnailUrl: img.thumb,
    description: pin.description || pin.grid_title || pin.title || "",
    link: pin.link ?? null,
    pinUrl: `https://www.pinterest.com/pin/${pin.id}/`,
    pinner: pin.pinner?.username
      ? {
          username: pin.pinner.username,
          full_name: pin.pinner.full_name,
        }
      : undefined,
    dominantColor: pin.dominant_color,
  };
}

/**
 * Pinterest sets `csrftoken` and `_pinterest_sess` (among others) on the
 * /search/pins page. We collect them from Set-Cookie headers and forward
 * them on the resource call.
 */
function parseSetCookies(headers: Headers): {
  cookieHeader: string;
  csrfToken: string | null;
} {
  // Workers' Headers exposes getSetCookie() which returns each Set-Cookie
  // as a separate string.
  type WithGetSetCookie = Headers & { getSetCookie?: () => string[] };
  const setCookieFn = (headers as WithGetSetCookie).getSetCookie;
  const setCookies =
    typeof setCookieFn === "function"
      ? setCookieFn.call(headers)
      : ((headers.get("set-cookie") ?? "")
          .split(/,\s*(?=[A-Za-z0-9_-]+=)/)
          .filter(Boolean) as string[]);

  const pairs: string[] = [];
  let csrfToken: string | null = null;

  for (const sc of setCookies) {
    const firstPart = sc.split(";")[0]?.trim();
    if (!firstPart) continue;
    const eq = firstPart.indexOf("=");
    if (eq <= 0) continue;
    const name = firstPart.slice(0, eq).trim();
    const value = firstPart.slice(eq + 1).trim();
    if (!name) continue;
    pairs.push(`${name}=${value}`);
    if (name === "csrftoken") csrfToken = value;
  }

  return { cookieHeader: pairs.join("; "), csrfToken };
}

async function pinterestSearch(query: string, pageSize: number): Promise<{
  results: NormalizedPin[];
  status?: number;
  error?: string;
}> {
  const sourceUrlPath = `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;

  // 1) Hit the search HTML page to obtain a session + csrftoken.
  const sessionResp = await fetch(`https://www.pinterest.com${sourceUrlPath}`, {
    headers: {
      ...COMMON_BROWSER_HEADERS,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
    redirect: "follow",
  });

  if (!sessionResp.ok) {
    return { results: [], status: sessionResp.status, error: "session_failed" };
  }

  const { cookieHeader, csrfToken } = parseSetCookies(sessionResp.headers);
  if (!csrfToken) {
    return { results: [], status: 502, error: "no_csrf_token" };
  }
  // We must consume the body to release the connection.
  await sessionResp.arrayBuffer();

  // 2) Call the search resource endpoint with the captured session.
  const data = JSON.stringify({
    options: {
      applied_unified_filters: null,
      appliedProductFilters: "---",
      article: null,
      auto_correction_disabled: false,
      bookmarks: [],
      corpus: null,
      customized_rerank_type: null,
      domains: null,
      dynamicPageSizeExpGroup: null,
      filters: null,
      journey_depth: null,
      page_size: pageSize,
      price_max: null,
      price_min: null,
      query,
      query_pin_sigs: null,
      redux_normalize_feed: true,
      request_params: null,
      rs: "typed",
      scope: "pins",
      selected_one_bar_modules: null,
      seoDrawerEnabled: false,
      source_id: null,
      source_module_id: null,
      source_url: sourceUrlPath,
      top_pin_id: null,
      top_pin_ids: null,
    },
    context: {},
  });

  const resourceUrl =
    `https://www.pinterest.com/resource/BaseSearchResource/get/` +
    `?source_url=${encodeURIComponent(sourceUrlPath)}` +
    `&data=${encodeURIComponent(data)}`;

  const resourceResp = await fetch(resourceUrl, {
    headers: {
      ...COMMON_BROWSER_HEADERS,
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRFToken": csrfToken,
      "X-Pinterest-AppState": "active",
      "X-Pinterest-PWS-Handler": "www/search/[scope].js",
      Cookie: cookieHeader,
      Referer: `https://www.pinterest.com${sourceUrlPath}`,
    },
  });

  if (!resourceResp.ok) {
    return {
      results: [],
      status: resourceResp.status,
      error: "resource_status",
    };
  }

  let payload: PinterestResponse;
  try {
    payload = (await resourceResp.json()) as PinterestResponse;
  } catch {
    return { results: [], status: 502, error: "invalid_json" };
  }

  const raw = payload.resource_response?.data?.results ?? [];
  const results = raw
    .map(normalize)
    .filter((r): r is NormalizedPin => r !== null);

  return { results };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname !== "/search") {
      return jsonResponse({ error: "not_found" }, { status: 404 });
    }

    const auth = request.headers.get("Authorization") ?? "";
    const expected = `Bearer ${env.PROXY_SECRET}`;
    if (!env.PROXY_SECRET || auth !== expected) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }

    const query = url.searchParams.get("q")?.trim();
    if (!query) {
      return jsonResponse(
        { error: "missing_query", message: "Provide ?q=<query>" },
        { status: 400 }
      );
    }

    const requestedSize = parseInt(
      url.searchParams.get("page_size") ?? "30",
      10
    );
    const pageSize = Math.max(
      1,
      Math.min(Number.isFinite(requestedSize) ? requestedSize : 30, 50)
    );

    let outcome: Awaited<ReturnType<typeof pinterestSearch>>;
    try {
      outcome = await pinterestSearch(query, pageSize);
    } catch (err) {
      return jsonResponse(
        {
          error: "upstream_fetch_failed",
          message: err instanceof Error ? err.message : "unknown",
        },
        { status: 502 }
      );
    }

    if (outcome.error) {
      return jsonResponse(
        {
          error: outcome.error,
          status: outcome.status,
        },
        { status: 502 }
      );
    }

    return jsonResponse(
      { query, results: outcome.results },
      {
        headers: {
          // Browser cache hint; the real cache layer is Cloudflare's edge,
          // which Workers automatically use for the /search response if
          // Cache-Control is set.
          "Cache-Control": "public, max-age=600, s-maxage=3600",
        },
      }
    );
  },
};
