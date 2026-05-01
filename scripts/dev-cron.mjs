// Local replacement for the Vercel cron. Hits the discovery-tick endpoint
// on a loop so queued DiscoveryRun rows actually get processed in dev.
//
// Run alongside `npm run dev`:
//   npm run dev:cron
//
// Env (read from .env.local via dotenvx):
//   DEV_CRON_URL          default http://localhost:3000/api/cron/discovery-tick
//   DEV_CRON_INTERVAL_MS  default 60000
//   CRON_SECRET           optional; if set, sent as Bearer token

const URL =
  process.env.DEV_CRON_URL ??
  "http://localhost:3000/api/cron/discovery-tick";
const INTERVAL_MS = Number(process.env.DEV_CRON_INTERVAL_MS ?? 60_000);
const SECRET = process.env.CRON_SECRET;

async function tick() {
  const startedAt = new Date().toISOString();
  try {
    const res = await fetch(URL, {
      headers: SECRET ? { authorization: `Bearer ${SECRET}` } : {},
    });
    const body = await res.text();
    console.log(`[${startedAt}] ${res.status} ${body.slice(0, 300)}`);
  } catch (err) {
    console.error(`[${startedAt}] tick failed:`, err);
  }
}

console.log(`dev-cron → ${URL} every ${INTERVAL_MS}ms`);
await tick();
setInterval(tick, INTERVAL_MS);
