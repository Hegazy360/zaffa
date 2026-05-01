// Shared Apify client. We use the synchronous `run-sync-get-dataset-items`
// endpoint for short jobs and fall back to the async start+poll flow when
// the actor needs >5 minutes. Apify free tier ($5/mo) covers our intended
// volume (a few hundred IG/TikTok/FB rows per day).
//
// Docs: https://docs.apify.com/api/v2

const BASE_URL = "https://api.apify.com/v2";

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) {
    throw new Error("APIFY_TOKEN is required for Apify discovery sources");
  }
  return t;
}

export interface ApifyRunOptions {
  // Actor id, slug-style (e.g. "apify/instagram-scraper").
  actor: string;
  input: Record<string, unknown>;
  // Hard cap on the result set size we pull back. Apify can return a lot.
  maxItems?: number;
  // Synchronous total timeout in seconds. Apify default is 5 min for the
  // sync endpoint; anything past 4 min we kick to async to be safe.
  timeoutSecs?: number;
}

// Slug -> URL path. Apify uses `~` as the org/actor separator in URLs.
function actorPath(slug: string): string {
  return slug.replace("/", "~");
}

export async function runActorSync(
  opts: ApifyRunOptions,
): Promise<unknown[]> {
  const max = opts.maxItems ?? 100;
  // memory=2048 is required by some actors (instagram-scraper) to spin up
  // at all on free-tier accounts; lower values can return 0 items silently.
  // timeout=300 is the Apify sync ceiling.
  const url =
    `${BASE_URL}/acts/${actorPath(opts.actor)}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token())}&clean=1&format=json&limit=${max}` +
    `&timeout=${opts.timeoutSecs ?? 240}&memory=2048`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts.input),
  });
  // Apify surfaces actor-level errors through:
  //   - non-2xx status codes (network, auth, billing, quota)
  //   - 200 with a JSON object containing { error: { type, message } }
  // If we don't catch the second case we silently return [] and the run
  // shows "Done · 0/0", which the user can't distinguish from a legit 0.
  const apifyRunId = res.headers.get("x-apify-actor-run-id");
  const apifyDatasetId = res.headers.get("x-apify-actor-dataset-id");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Apify ${opts.actor} ${res.status}: ${body.slice(0, 500)}` +
        (apifyRunId ? ` (run=${apifyRunId})` : ""),
    );
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Apify ${opts.actor} returned non-JSON: ${text.slice(0, 300)}`,
    );
  }
  if (!Array.isArray(data)) {
    // Could be { error: { ... } } or some unexpected shape — surface it.
    const obj = data as { error?: { type?: string; message?: string } };
    if (obj?.error) {
      throw new Error(
        `Apify ${opts.actor} actor error: ${obj.error.type ?? "unknown"} — ${obj.error.message ?? "(no message)"}` +
          (apifyRunId ? ` (run=${apifyRunId})` : ""),
      );
    }
    throw new Error(
      `Apify ${opts.actor} returned non-array body: ${text.slice(0, 300)}`,
    );
  }
  // When the dataset is empty, double-check the actor run's actual status —
  // Apify will happily return `[]` from a sync call even if the actor was
  // FAILED, ABORTED, or hit a "no credits" / soft-blocked state. We surface
  // any of those as real errors so the run row doesn't show a misleading
  // "Done · 0/0".
  if (data.length === 0 && apifyRunId) {
    try {
      const statusRes = await fetch(
        `${BASE_URL}/actor-runs/${apifyRunId}?token=${encodeURIComponent(token())}`,
      );
      if (statusRes.ok) {
        const statusJson = (await statusRes.json()) as {
          data?: {
            status?: string;
            statusMessage?: string;
            exitCode?: number;
          };
        };
        const s = statusJson.data?.status ?? "UNKNOWN";
        const msg = statusJson.data?.statusMessage ?? "(no actor message)";
        if (s !== "SUCCEEDED") {
          throw new Error(
            `Apify ${opts.actor} actor run ${s}: ${msg} (run=${apifyRunId})`,
          );
        }
        // Even on SUCCEEDED, log so the admin can verify in console.
        console.warn(
          `[apify] ${opts.actor} succeeded with 0 items (run=${apifyRunId}, msg=${msg})`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Apify ")) throw err;
      console.warn(`[apify] could not verify run status: ${err}`);
    }
  }
  return data;
}

// Lightweight helper for the rate-limit cooldown. We persist a hash like
// `apify:<source>:<query>` in the DiscoveryRun table — but for now we lean
// on (source, source_id) uniqueness and the discovery router's per-call
// gating. This stub leaves room for a Redis-backed cooldown later.
export function cooldownKey(source: string, query: string): string {
  return `apify:${source}:${query.toLowerCase().trim()}`;
}
