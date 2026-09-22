import { Ratelimit } from "@upstash/ratelimit";
import { TRPCError } from "@trpc/server";
import { redis } from "./redis";

// Per-surface limiters. Each one gets its own prefix so analytics &
// throttling don't bleed across endpoints. When Upstash isn't configured
// (local dev) the helpers below short-circuit to "allowed" instead of
// throwing.
function makeLimiter(
  prefix: string,
  limit: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    prefix,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
  });
}

export const limiters = {
  // Auth surfaces, keep tight to slow down credential stuffing.
  authSignIn: makeLimiter("rl:auth:signin", 10, "1 m"),
  authSignUp: makeLimiter("rl:auth:signup", 5, "1 h"),
  authPasswordReset: makeLimiter("rl:auth:reset", 5, "1 h"),
  // Public unsubscribe HMAC route, abused only to enumerate user ids.
  unsubscribe: makeLimiter("rl:unsub", 30, "1 m"),
  // Public contact / bug-report form. Tight per-identifier window so a
  // bot that solves the honeypot can't blast our inbox; a human with a
  // legitimate follow-up message will easily clear it.
  contactForm: makeLimiter("rl:contact", 5, "10 m"),
  contactFormDaily: makeLimiter("rl:contact:d", 20, "1 d"),
  // Full-service enquiries. Same shape as the contact form, this is the
  // flagship tier's only inbound channel, so the limits exist to slow abuse
  // without ever turning a real buyer away.
  enquiryForm: makeLimiter("rl:enquiry", 5, "10 m"),
  enquiryFormDaily: makeLimiter("rl:enquiry:d", 20, "1 d"),
  // Per-user AI surfaces. These are the most expensive operations.
  // Two layers: the per-hour limiter caps burst usage; the per-day
  // limiter is the cost ceiling. A prompt-only render was measured at
  // $0.136 on google/gemini-3-pro-image-preview (see image-gen.ts), so
  // 60/day is ~$8.16 per user per day worst case. Dressing a venue photo
  // on the Images API is ~$0.057 and shares these buckets.
  aiRender: makeLimiter("rl:ai:render", 30, "1 h"),
  aiRenderDaily: makeLimiter("rl:ai:render:d", 60, "1 d"),
  aiVideo: makeLimiter("rl:ai:video", 5, "1 h"),
  aiVideoDaily: makeLimiter("rl:ai:video:d", 10, "1 d"),
  // Free-tier-only IP limiter. The per-user free quota (1 render via
  // `wedding_free_taste_v1.renders_quota`) catches a single visitor;
  // this catches anyone spinning up fresh anonymous Supabase users to
  // dodge the per-user cap by clearing cookies. 3 free renders / IP /
  // day is a balance between aggressive abuse protection and not
  // burning legitimate same-household visitors (parents + couple
  // sharing a router).
  aiRenderFreePerIp: makeLimiter("rl:ai:render:free:ip", 3, "1 d"),
  // Talked edits of a render (F2), ~$0.022 each on the edit model. Their
  // own buckets rather than the render ones: a couple refining one design
  // makes many more calls than one rendering it, and must not lock
  // themselves out of their next render by talking. The pack's edits quota
  // (reserved atomically before the call) is the real bound; these cap a
  // loop. 80/day is ~$1.76 per user per day worst case. The free per-IP
  // bucket is the edit twin of `aiRenderFreePerIp`: 3 free edits per
  // user, so 12 per IP per day leaves room for a household.
  aiEdit: makeLimiter("rl:ai:edit", 30, "1 h"),
  aiEditDaily: makeLimiter("rl:ai:edit:d", 80, "1 d"),
  aiEditFreePerIp: makeLimiter("rl:ai:edit:free:ip", 12, "1 d"),
  // Cheap text/vision LLM reads (~$0.001 each on DESIGN_LLM_MODEL): the
  // intake check before a render (F3) and the decor analysis behind the
  // costed plan (F4). Reachable by anonymous sessions, so still bounded.
  aiIntake: makeLimiter("rl:ai:intake", 20, "1 h"),
  aiDecorPlan: makeLimiter("rl:ai:decor", 20, "1 h"),
  // Per-user image uploads to Cloudinary: reference photos, Pinterest
  // re-hosts and venue photos. Nothing capped these before, and every one
  // is a server-side upload of up to several MB on our Cloudinary quota.
  imageUpload: makeLimiter("rl:upload:image", 40, "1 h"),
  // Family share links (F6). Creating one is per couple; voting is per
  // share-page visitor, who has no session.
  shareCreate: makeLimiter("rl:share:create", 20, "1 h"),
  shareVote: makeLimiter("rl:share:vote", 30, "10 m"),
  // Public homepage chat, keyed per IP. Cheap per message (~$0.001 at
  // gpt-4.1-mini with max_tokens 350) but reachable without any session,
  // so both a burst cap and a daily ceiling. NOTE: `consume` fails OPEN
  // when Upstash is down, the Postgres-backed global daily cap inside
  // `chat.ask` is the guarantee, these buckets are the first line.
  chat: makeLimiter("rl:chat", 10, "5 m"),
  chatDaily: makeLimiter("rl:chat:d", 40, "1 d"),
  // Admin-triggered discovery / outreach. Per-user (admin) limits keep a
  // single rogue admin from blowing budgets.
  discoveryRun: makeLimiter("rl:discovery:run", 30, "1 h"),
  discoveryRunDaily: makeLimiter("rl:discovery:run:d", 200, "1 d"),
  outreachDraft: makeLimiter("rl:outreach:draft", 60, "1 h"),
  outreachDraftDaily: makeLimiter("rl:outreach:draft:d", 200, "1 d"),
  // Admin post generator. One `adminPosts.generate` fans out to up to 4
  // renders (the `palette_test` format) at ~$0.14 each, so ~$0.56 a click -
  // and it bills the same single OpenRouter balance the customer render
  // funnel runs on. That balance hitting zero in August is what silently
  // dropped two real prospects, so a stuck spinner and an impatient admin
  // re-clicking is not a theoretical failure here. The hourly bucket stops
  // the click-loop; the daily one is the ceiling.
  postGenerate: makeLimiter("rl:posts:generate", 10, "1 h"),
  postGenerateDaily: makeLimiter("rl:posts:generate:d", 40, "1 d"),
  // Generic per-user write fallback used by mutations that want a sane
  // default but don't justify their own bucket.
  mutationDefault: makeLimiter("rl:mut:default", 120, "1 m"),
};

export type LimiterKey = keyof typeof limiters;

/**
 * Consume one token from a limiter. Returns the underlying Upstash result.
 * If Upstash isn't configured OR is unreachable (stale credentials,
 * transient network failure, provider outage), returns `{ success: true }`
 * so the app fails open rather than 500-ing on a non-critical dependency.
 * A rate-limiter should slow abuse; it should never take the app down.
 * Failures are logged once at warn-level so we don't drown the console
 * when a misconfigured Upstash URL keeps missing DNS.
 *
 * Always pass a stable identifier (user id, IP, session id) so the bucket
 * is keyed correctly.
 */
export async function consume(
  key: LimiterKey,
  identifier: string,
): Promise<{ success: boolean; remaining?: number; reset?: number }> {
  const limiter = limiters[key];
  if (!limiter) return { success: true };
  try {
    const res = await limiter.limit(identifier);
    return {
      success: res.success,
      remaining: res.remaining,
      reset: res.reset,
    };
  } catch (err) {
    // Network / configuration error reaching Upstash. Fail open with a
    // single warn log so the caller still succeeds.
    console.warn("[rate-limit] limiter unreachable, failing open", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: true };
  }
}

/**
 * Throw a tRPC `TOO_MANY_REQUESTS` error when a limiter rejects. Use from
 * inside a tRPC procedure when an explicit middleware would be overkill.
 */
export async function enforceTrpc(
  key: LimiterKey,
  identifier: string,
  message = "Too many requests, please slow down.",
): Promise<void> {
  const res = await consume(key, identifier);
  if (!res.success) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
  }
}

/**
 * Convenience that consumes from multiple limiters in sequence. The first
 * one that rejects raises `TOO_MANY_REQUESTS` with its message. Used to
 * stack a per-hour burst limit with a per-day cost ceiling on the same
 * surface (e.g. AI renders).
 */
export async function enforceTrpcMany(
  pairs: Array<{ key: LimiterKey; message?: string }>,
  identifier: string,
): Promise<void> {
  for (const { key, message } of pairs) {
    await enforceTrpc(key, identifier, message ?? undefined);
  }
}

/**
 * Best-effort client identifier from an incoming `Request`. Falls back to
 * `unknown` when no proxy headers are present (e.g. local dev). Vercel
 * sets `x-forwarded-for` and `x-real-ip` on the edge.
 */
export function ipFromRequest(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
