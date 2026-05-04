import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Upstash credentials are optional in dev so the app can boot without
// Redis. When unset, `redis` is `null` and rate-limit helpers in
// `./rate-limit.ts` short-circuit to "allowed" — which is fine locally
// but should be detected and refused in production (see env-checks).
//
// Two naming conventions are accepted:
//   1. UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//      — what you get when you copy creds directly from the Upstash
//        console.
//   2. KV_REST_API_URL / KV_REST_API_TOKEN
//      — what Vercel writes when the Upstash Redis Marketplace
//        integration provisions the database for you. The URL points
//        at the same host; the token is a read/write REST token.
//
// We prefer explicit `UPSTASH_*` vars when both are set so a developer
// overriding the Vercel-pulled defaults wins.
const url =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const redis: Redis | null =
  url && token ? new Redis({ url, token }) : null;

// Default sliding-window limiter kept for backwards-compat with any caller
// that imports it. Prefer the named limiters in `./rate-limit.ts` for new
// code so each surface has its own bucket and analytics tag.
export const ratelimit: Ratelimit | null = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "10 s"),
      analytics: true,
    })
  : null;
