import { Ratelimit } from "@upstash/ratelimit";
import { TRPCError } from "@trpc/server";
import { redis } from "./redis";
import { prisma } from "./prisma";
import { reportError } from "./logger";

// Per-surface limiters. Each one gets its own prefix so analytics &
// throttling don't bleed across endpoints.
//
// Upstash is the primary counter. Postgres is the fallback, and it exists
// because of what happened without it: on 2026-09-25 production logs showed
// every Upstash call failing with "fetch failed". The database behind the
// configured URL had been deleted (its hostname no longer resolves), and since
// the limiters failed open, every cap in production - paid renders, the one
// free render per IP, sign-in brute force, chat - had quietly stopped limiting
// anything. Nothing looked wrong, because allowing everything looks exactly
// like a quiet day. Now a lost Upstash costs one Postgres upsert per check
// instead of the caps themselves.
type Window = Parameters<typeof Ratelimit.slidingWindow>[1];

interface Limiter {
  prefix: string;
  limit: number;
  window: Window;
  /** Null when Upstash is not configured; Postgres then counts alone. */
  upstash: Ratelimit | null;
}

function makeLimiter(prefix: string, limit: number, window: Window): Limiter {
  return {
    prefix,
    limit,
    window,
    upstash: redis
      ? new Ratelimit({
          redis,
          prefix,
          limiter: Ratelimit.slidingWindow(limit, window),
          analytics: true,
        })
      : null,
  };
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
  // The intake check runs by itself on the generate step, for any fresh
  // anonymous session, and bills the one OpenRouter balance the render
  // funnel runs on. So beyond the burst bucket: a daily ceiling per user and
  // per IP (a couple re-reading their brief makes a handful a day), and one
  // global daily ceiling for everyone, ~$2.80 at ~$0.0014 a check with ten
  // references. Spending it all only hides an optional card; the renders it
  // would otherwise starve keep working. `ai.checkIntake` consumes these
  // with `failClosed`, so losing both Upstash and Postgres cannot lift them.
  aiIntakeDaily: makeLimiter("rl:ai:intake:d", 60, "1 d"),
  aiIntakeGlobalDaily: makeLimiter("rl:ai:intake:global", 2000, "1 d"),
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
  // so both a burst cap and a daily ceiling. These are the first line; the
  // global daily cap counted from chat_messages inside `chat.ask` is the
  // guarantee.
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

export interface ConsumeOptions {
  /**
   * Refuse instead of allow when NEITHER counter can be reached (Upstash and
   * the Postgres fallback both down). For a paid call nothing else bounds and
   * that the product works without (the intake check): there, a lost limiter
   * would be an open tap on the OpenRouter balance, and refusing costs only an
   * optional card.
   */
  failClosed?: boolean;
}

const WINDOW_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** "10 m" -> 600000. Throws on a shape Upstash would also reject. */
export function windowMs(window: Window): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(String(window).trim());
  if (!match) throw new Error(`Unsupported rate-limit window: ${window}`);
  return Number(match[1]) * WINDOW_UNIT_MS[match[2]!]!;
}

// Circuit breaker. A deleted Upstash host fails on DNS for every call; paying
// that lookup on each request (and logging it each time) is how the outage
// above hid in plain sight as a stream of identical warnings. After one
// failure we go straight to Postgres for a minute, then try Upstash again.
const UPSTASH_RETRY_AFTER_MS = 60_000;
let upstashDownUntil = 0;

/** Test hook: forget a tripped breaker. */
export function resetRateLimitBreaker(): void {
  upstashDownUntil = 0;
}

/**
 * Fixed-window count in Postgres. Coarser than Upstash's sliding window (a
 * burst straddling a window edge can reach twice the limit), which is an
 * acceptable price for a fallback whose job is to keep caps from vanishing.
 */
async function consumeInPostgres(
  limiter: Limiter,
  identifier: string,
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const span = windowMs(limiter.window);
  const start = Math.floor(Date.now() / span) * span;
  const bucket = `${limiter.prefix}:${identifier}`;
  const rows = await prisma.$queryRaw<Array<{ hits: number }>>`
    INSERT INTO rate_limit_hits (bucket, window_start, hits)
    VALUES (${bucket}, ${new Date(start)}, 1)
    ON CONFLICT (bucket, window_start)
    DO UPDATE SET hits = rate_limit_hits.hits + 1
    RETURNING hits`;
  const hits = Number(rows[0]?.hits ?? 1);
  return {
    success: hits <= limiter.limit,
    remaining: Math.max(0, limiter.limit - hits),
    reset: start + span,
  };
}

/**
 * Consume one token from a limiter.
 *
 * Upstash answers when it can. When it is not configured, unreachable, or
 * recently failed (see the breaker), Postgres counts instead. Only when both
 * are down does the limiter give up: it allows (a rate limiter should slow
 * abuse, never take the app down) unless the caller asked to fail closed.
 *
 * Always pass a stable identifier (user id, IP, session id) so the bucket
 * is keyed correctly.
 */
export async function consume(
  key: LimiterKey,
  identifier: string,
  { failClosed = false }: ConsumeOptions = {},
): Promise<{ success: boolean; remaining?: number; reset?: number }> {
  const limiter = limiters[key];
  if (!limiter) return { success: true };

  if (limiter.upstash && Date.now() >= upstashDownUntil) {
    try {
      const res = await limiter.upstash.limit(identifier);
      return {
        success: res.success,
        remaining: res.remaining,
        reset: res.reset,
      };
    } catch (err) {
      upstashDownUntil = Date.now() + UPSTASH_RETRY_AFTER_MS;
      // To Sentry, not just stdout: a console.warn is exactly how the
      // deleted database went unnoticed. The breaker keeps this to one
      // event per instance per minute.
      reportError("rate_limit.upstash_unreachable", err, { key });
    }
  }

  try {
    return await consumeInPostgres(limiter, identifier);
  } catch (err) {
    reportError("rate_limit.no_counter_reachable", err, {
      key,
      failing: failClosed ? "closed" : "open",
    });
    return { success: !failClosed };
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
  options?: ConsumeOptions,
): Promise<void> {
  const res = await consume(key, identifier, options);
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
