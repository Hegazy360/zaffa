import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { isFlagEnabled } from "@/lib/flags";
import { enforceTrpcMany, ipFromRequest } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { chatCompletion, type ChatMessage } from "@/server/llm/openrouter";
import { captureServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { reportError } from "@/lib/logger";
import {
  resolveCountryFromRequest,
  resolveVisionPackPricing,
} from "@/server/services/vision-pack-pricing";
import { minorToMajor } from "@/lib/vision-pack-pricing";
import { PACK_SKUS, DEFAULT_PACK_SKU } from "@/lib/vision-pack";
import { quoteGuidanceFor } from "@/lib/concierge-pricing";
import {
  REPLY_WITHIN_HOURS,
  WHATSAPP_NUMBER_DISPLAY,
} from "@/lib/contact-channels";

/**
 * The homepage AI concierge — answers "what is Zaffa, what does it cost,
 * how does it work" in the visitor's language.
 *
 * This is the app's only public, unauthenticated LLM surface, and `/` is
 * deliberately session-free (never add it to the middleware's
 * AUTH_AWARE_ROUTE — that TTFB cost was explicitly optimized away). The
 * defense stack, in order:
 *
 *   1. `aiChat` flag — PRECONDITION_FAILED when off. The instant kill:
 *      the ISR'd homepage can lag a flag flip by 300s; this cannot.
 *   2. Turnstile on the FIRST message of a conversation for callers
 *      without a permanent session (same posture as `ai.renderScene`).
 *   3. Upstash per-IP buckets (burst + daily). These fail OPEN when
 *      Upstash is down, so —
 *   4. A Postgres-backed global daily cap: count today's assistant
 *      messages. Not optional; it is the only bound that cannot fail
 *      open, because it lives in the same database the reply is written
 *      to.
 *
 * Grounding is entirely server-side: a product-knowledge prompt plus the
 * visitor's own market prices resolved through the same helpers the
 * paywall uses — an LLM quoting prices from a static prompt would be
 * wrong in most markets.
 */

const MODEL = process.env.CHAT_LLM_MODEL ?? "openai/gpt-4.1-mini";
const MAX_TOKENS = 350;
/** Hard ceiling on assistant replies per UTC day, across all visitors.
 *  At ~$0.001/reply this caps worst-case spend near $2/day. */
const GLOBAL_DAILY_CAP = Number(process.env.CHAT_DAILY_GLOBAL_CAP ?? 2000);

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});

function productKnowledge(locale: string): string {
  return `You are Zaffa's assistant on zaffa.ai — a wedding platform. Brand name in Arabic is زفّة (never زفافا or زافا).

WHAT ZAFFA IS
- Couples design their wedding visually with AI: pick a palette and style, add inspiration, and get photorealistic renders of their actual reception.
- Two ways to use Zaffa:
  1. The Design Pack (self-serve, one-time payment, not a subscription): 20 photoreal renders across 3 styles, 2 short cinematic videos, a printable PDF lookbook, and a private shareable microsite. Starts with a FREE render — no card needed.
  2. The Whole Wedding (full concierge): Zaffa runs the entire wedding end to end — venue, vendors, budget, coordination. Priced per wedding after one call; the fee table is published on /pricing. The couple tells us about their day at /enquire.
- Approving a design is free: it tells our team "this is the one" and we contact the couple about making it real.
- We operate globally with UAE/Gulf emphasis, based in Paris, and never turn a couple away by country. We speak Arabic, English, and French.
- A human replies on WhatsApp (${WHATSAPP_NUMBER_DISPLAY}) within ${REPLY_WITHIN_HOURS} hours.

STYLE
- Answer in the visitor's language (their locale is "${locale}"). For Arabic: warm, natural, Egyptian-leaning colloquial for general questions; switch to clear فصحى when quoting prices or commitments.
- 2-4 short sentences. Warm, concrete, never salesy. No emoji spam (one at most).
- If they seem ready to talk or ask something you cannot answer, point them to the WhatsApp button or "Tell us about your wedding" (/enquire) right below this chat.

HARD RULES
- Prices: quote ONLY the figures in the PRICING block below — they are already localized to this visitor's market. Never invent prices, discounts, or currencies for other markets; if asked about another market, say prices adapt per market and point to /pricing.
- Never mention planner or vendor marketplaces, planner matching, or vendor signup — those do not exist on Zaffa.
- Never invent testimonials, review scores, or customer counts.
- You are an AI assistant; if asked, say so. Do not collect payment details or passwords. Politely decline questions unrelated to weddings or Zaffa.`;
}

async function pricingBlock(country: string | null, locale: string): Promise<string> {
  const pack = await resolveVisionPackPricing(country, DEFAULT_PACK_SKU);
  const major = minorToMajor(pack.amount, pack.currency);
  const packMeta = PACK_SKUS[DEFAULT_PACK_SKU];
  const lines = [
    `PRICING (visitor market: ${country ?? "unknown — global default"})`,
    `- Design Pack: ${major} ${pack.currency.toUpperCase()} one-time (${packMeta.quotas.renders} renders / ${packMeta.quotas.styles} styles / ${packMeta.quotas.videos} videos + lookbook + microsite). The first render is free.`,
  ];
  const guidance = quoteGuidanceFor(country);
  if (guidance) {
    const bands = guidance.bands
      .map(
        (b) =>
          `budget ${b.budgetFrom.toLocaleString("en-US")}–${
            b.budgetTo ? b.budgetTo.toLocaleString("en-US") : "+"
          } ${guidance.currency} → flat fee ${b.fee.toLocaleString("en-US")} ${guidance.currency}`,
      )
      .join("; ");
    lines.push(
      `- The Whole Wedding (full concierge), published fee bands for this market: ${bands}. Larger weddings are quoted bespoke. Full table: /pricing.`,
    );
  } else {
    lines.push(
      `- The Whole Wedding (full concierge): quoted bespoke for this market after one call — see /pricing and /enquire.`,
    );
  }
  // The locale matters to the model only for digit style; keep figures in
  // Latin digits — D11 pins Latin digits on money in Arabic too.
  void locale;
  return lines.join("\n");
}

export const chatRouter = router({
  ask: publicProcedure
    .input(
      z.object({
        messages: z.array(messageSchema).min(1).max(8),
        conversationId: z.string().uuid().nullish(),
        turnstileToken: z.string().max(2048).nullish(),
        locale: z.string().max(5).default("en"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isFlagEnabled("aiChat")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "CHAT_DISABLED",
        });
      }

      const ip = ctx.req ? ipFromRequest(ctx.req) : null;

      // Turnstile once per conversation for visitors without a permanent
      // account. Signed-in (non-anonymous) users are past the email gate —
      // they are not bot traffic.
      const isFirstMessage = !input.conversationId;
      const hasPermanentAccount = !!ctx.user && !ctx.user.is_anonymous;
      if (isFirstMessage && !hasPermanentAccount) {
        const tsResult = await verifyTurnstile(input.turnstileToken, ip);
        if (!tsResult.ok) {
          throw new TRPCError({ code: "FORBIDDEN", message: "TURNSTILE_FAILED" });
        }
      }

      await enforceTrpcMany(
        [{ key: "chat" }, { key: "chatDaily" }],
        ctx.user?.id ?? ip ?? "anon",
      );

      // The cap that cannot fail open. Counted on assistant rows so a
      // refused request doesn't consume budget.
      const midnightUtc = new Date();
      midnightUtc.setUTCHours(0, 0, 0, 0);
      const usedToday = await prisma.chatMessage.count({
        where: { role: "assistant", created_at: { gte: midnightUtc } },
      });
      if (usedToday >= GLOBAL_DAILY_CAP) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "CHAT_GLOBAL_CAP",
        });
      }

      const country = resolveCountryFromRequest(ctx.req ?? null);
      const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
      if (!lastUser) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "NO_USER_MESSAGE" });
      }

      // Conversation row first, then the user's message BEFORE the model
      // call — an LLM failure must still leave the question on record.
      const conversation = input.conversationId
        ? await prisma.chatConversation.findUnique({
            where: { id: input.conversationId },
            select: { id: true },
          })
        : null;
      const conversationId =
        conversation?.id ??
        (
          await prisma.chatConversation.create({
            data: {
              user_id: ctx.user && !ctx.user.is_anonymous ? ctx.user.id : null,
              locale: input.locale,
              country,
            },
            select: { id: true },
          })
        ).id;

      await prisma.chatMessage.create({
        data: {
          conversation_id: conversationId,
          role: "user",
          content: lastUser.content,
        },
      });

      await captureServer(
        ctx.user?.id ?? conversationId,
        ANALYTICS_EVENTS.CHAT_MESSAGE_SENT,
        {
          locale: input.locale,
          country,
          message_index: input.messages.filter((m) => m.role === "user").length,
          authed: hasPermanentAccount,
        },
      );

      let reply: string;
      try {
        const system: ChatMessage = {
          role: "system",
          content: `${productKnowledge(input.locale)}\n\n${await pricingBlock(country, input.locale)}`,
        };
        reply = await chatCompletion({
          model: MODEL,
          messages: [system, ...input.messages],
          temperature: 0.5,
          maxTokens: MAX_TOKENS,
          appTitle: "Zaffa chat",
        });
      } catch (err) {
        reportError("chat.reply_failed", err, { conversationId });
        await captureServer(
          ctx.user?.id ?? conversationId,
          ANALYTICS_EVENTS.CHAT_REPLY_FAILED,
          { locale: input.locale, country },
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "CHAT_UNAVAILABLE",
        });
      }

      // Best-effort bookkeeping: the visitor already has their answer.
      try {
        await prisma.$transaction([
          prisma.chatMessage.create({
            data: { conversation_id: conversationId, role: "assistant", content: reply },
          }),
          prisma.chatConversation.update({
            where: { id: conversationId },
            data: {
              last_message_at: new Date(),
              message_count: { increment: 2 },
            },
          }),
        ]);
      } catch (err) {
        reportError("chat.persist_failed", err, { conversationId });
      }

      return { reply, conversationId };
    }),
});
