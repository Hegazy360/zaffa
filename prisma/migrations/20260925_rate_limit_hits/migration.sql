-- Postgres fallback for the rate limiters (src/lib/rate-limit.ts).
--
-- On 2026-09-25 production logs showed every Upstash call failing with
-- "fetch failed": the database behind UPSTASH_REDIS_REST_URL no longer
-- resolves (NXDOMAIN). Because the limiters fail open, every cap in
-- production (paid renders, the free-render-per-IP rule, sign-in brute force,
-- chat) had silently stopped limiting anything. This table lets the limiters
-- keep counting when Upstash is unreachable. Additive only; applied
-- surgically per prisma/migrations/README.md.

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  bucket        text        NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer     NOT NULL DEFAULT 0,
  CONSTRAINT rate_limit_hits_pkey PRIMARY KEY (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_window_start_idx
  ON rate_limit_hits (window_start);
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
