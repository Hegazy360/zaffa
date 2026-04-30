# zaffa-pinterest-search

A tiny Cloudflare Worker that proxies search queries to Pinterest's
undocumented `BaseSearchResource` JSON endpoint and returns normalized pin
objects to our Next.js backend.

## Why a Worker?

Pinterest blocks requests originating from AWS IP ranges (where Vercel runs)
far more aggressively than from Cloudflare. By doing the fetch from a CF
Worker we get reliable success rates and 100k free requests/day.

## Endpoints

| Method | Path      | Purpose                          |
| ------ | --------- | -------------------------------- |
| GET    | `/health` | Liveness check (no auth)         |
| GET    | `/search` | Pinterest search (auth required) |

`/search` query params:

- `q` (required) — search query, e.g. `wedding florals tablescape`
- `page_size` (optional, 1–50, default 30) — number of pins to return

Successful response shape:

```json
{
  "query": "wedding florals tablescape",
  "results": [
    {
      "id": "12345",
      "imageUrl": "https://i.pinimg.com/originals/...",
      "thumbnailUrl": "https://i.pinimg.com/236x/...",
      "description": "Wildflower centerpiece...",
      "link": "https://example.com/blog/post",
      "pinUrl": "https://www.pinterest.com/pin/12345/",
      "pinner": { "username": "...", "full_name": "..." },
      "dominantColor": "#a8b89c"
    }
  ]
}
```

## One-time setup

From the repo root:

```bash
# Sign in to Cloudflare (opens your browser)
npx wrangler login

# Generate a strong shared secret and store it in CF Workers
cd workers/pinterest-search
echo "your-strong-random-secret" | npx wrangler secret put PROXY_SECRET

# Deploy the Worker
npx wrangler deploy
```

Or, from the repo root, the same deploy in one shot:

```bash
npm run deploy:worker
```

After deploy, copy the URL Wrangler prints (e.g.
`https://zaffa-pinterest-search.<your-account>.workers.dev`) into
`.env.local` as:

```
PINTEREST_PROXY_URL=https://zaffa-pinterest-search.<your-account>.workers.dev
PINTEREST_PROXY_SECRET=your-strong-random-secret
```

## Local dev

```bash
cd workers/pinterest-search
npx wrangler dev
# Worker is now at http://localhost:8787
# Test:
#   curl -H "Authorization: Bearer $PROXY_SECRET" \
#        "http://localhost:8787/search?q=wedding+florals"
```

## Maintenance

This Worker depends on Pinterest's undocumented JSON endpoint. The shape can
change without notice (typically every 6–12 months). When that happens:

1. Open `https://www.pinterest.com/search/pins/?q=test` in a browser.
2. Open DevTools → Network → filter for `BaseSearchResource`.
3. Compare the live request URL and response shape against `src/index.ts`
   and update the request payload / response parser accordingly.
