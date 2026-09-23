import "server-only";
import { isFlagEnabled } from "@/lib/flags";
import { consume } from "@/lib/rate-limit";
import { reportError } from "@/lib/logger";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { readStoredDecor, type StoredDecor } from "@/lib/decor-analysis";
import { computeDecorPlan, type DecorMarket, type DecorPlan } from "@/lib/decor-pricing";
import { analyzeAndStoreDecor } from "@/server/ai/decor-plan";

/**
 * The lookbook's "What it takes to build this" pages (F4), priced on the
 * server exactly as `decorPlan.forMedia` prices the designer panel.
 *
 * The lookbook is a paid artefact the couple may download before ever
 * opening the panel, so a render with no cached analysis is read here, once,
 * and cached on its row like the panel would. Everything that can go wrong
 * (flag off, limiter spent, model down) returns null: the lookbook prints
 * without the plan rather than failing a download someone paid for.
 */
export async function lookbookDecorPlan(args: {
  userId: string;
  designId: string;
  render: { id: string; url: string; cloudinary_public_id: string | null; meta: unknown };
  design: { guest_count: number | null; size: string | null; setting: string | null };
  locale: string;
  market: DecorMarket;
}): Promise<{ plan: DecorPlan; questions: string[] } | null> {
  if (!isFlagEnabled("decorPlan")) return null;
  const { render, design, locale, market } = args;

  let decor: StoredDecor | null = readStoredDecor(render.meta);
  const firstCompute = !decor;
  if (!decor) {
    // Same bucket as the panel: the lookbook is not a way around it.
    const limit = await consume("aiDecorPlan", args.userId);
    if (!limit.success) return null;
    try {
      const result = await analyzeAndStoreDecor(render, {
        locale,
        setting: design.setting,
        // The route also has Chromium to start and every image to fetch.
        timeoutMs: 20_000,
      });
      decor = result.decor;
      if (!result.stored) {
        reportError("decor_plan.cache_write_failed", result.error, {
          mediaId: render.id,
          from: "lookbook",
        });
      }
    } catch (err) {
      reportError("decor_plan.analyze_failed", err, {
        mediaId: render.id,
        userId: args.userId,
        from: "lookbook",
      });
      return null;
    }
  }

  const plan = computeDecorPlan(decor, {
    guestCount: design.guest_count,
    size: design.size,
    setting: design.setting,
    market,
  });
  if (firstCompute) {
    await trackServer(args.userId, ANALYTICS_EVENTS.DESIGN_DECOR_PLAN_VIEWED, {
      design_id: args.designId,
      media_id: render.id,
      market,
      items: plan.items.length,
      viewer: "lookbook",
    });
  }
  // The model's questions only in the language they were written in; the
  // page falls back to the standard ones otherwise.
  return { plan, questions: decor.locale === locale ? decor.questions : [] };
}
