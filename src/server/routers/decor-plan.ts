import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { isFlagEnabled } from "@/lib/flags";
import { enforceTrpc } from "@/lib/rate-limit";
import { reportError } from "@/lib/logger";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { assertAdmin } from "@/lib/admin-guard";
import { LOCALE_COOKIE, defaultLocale, isLocale, locales } from "@/i18n/config";
import { readStoredDecor, type StoredDecor } from "@/lib/decor-analysis";
import {
  DECOR_MARKETS,
  DECOR_MARKET_OPTIONS,
  computeDecorPlan,
  marketForCountry,
} from "@/lib/decor-pricing";
import { resolveCountryFromRequest } from "@/server/services/vision-pack-pricing";
import { analyzeAndStoreDecor } from "@/server/ai/decor-plan";

/** The couple's locale: what the client says, else the cookie, else en. */
function requestLocale(req: Request | null, fromInput: string | undefined): string {
  if (isLocale(fromInput)) return fromInput;
  const cookie = req?.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isLocale(value) ? value : defaultLocale;
}

export const decorPlanRouter = router({
  /**
   * F4: the costed decor plan for one render version.
   *
   * The analysis (what the render shows) is read by the design LLM once and
   * cached on the media row; quantities and prices are recomputed from it on
   * every call, so a guest-count change or a market switch costs nothing.
   *
   * Readable by the design's owner, and by an admin for the enquiry brief.
   * Anyone else gets NOT_FOUND, the same answer as a missing id, so a leaked
   * media id does not confirm the render exists.
   *
   * Anonymous owners must have passed the email gate first: before that the
   * render itself is hidden behind the gate, and a plan describing it would
   * hand out what the gate is there to trade for an email (and spend a model
   * call on every bot that reaches the free designer).
   */
  forMedia: protectedProcedure
    .input(
      z.object({
        mediaId: z.string().uuid(),
        market: z.enum(DECOR_MARKETS).optional(),
        locale: z.enum(locales).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Kill switch, checked here as well as in the UI because this is the
      // check that cannot lag a flag flip.
      if (!isFlagEnabled("decorPlan")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "DECOR_PLAN_DISABLED",
        });
      }

      const media = await prisma.venueDesignMedia.findFirst({
        where: { id: input.mediaId, type: "render" },
        select: {
          id: true,
          url: true,
          cloudinary_public_id: true,
          meta: true,
          design: {
            select: {
              id: true,
              user_id: true,
              guest_count: true,
              size: true,
              setting: true,
            },
          },
        },
      });
      if (!media) throw new TRPCError({ code: "NOT_FOUND" });

      const isOwner = media.design.user_id === ctx.user.id;
      if (!isOwner) {
        try {
          await assertAdmin(ctx.user.id);
        } catch {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
      }

      if (isOwner && ctx.user.is_anonymous) {
        const profile = await prisma.profile.findUnique({
          where: { id: ctx.user.id },
          select: { free_render_email: true },
        });
        if (!profile?.free_render_email) {
          throw new TRPCError({ code: "FORBIDDEN", message: "EMAIL_REQUIRED" });
        }
      }

      const locale = requestLocale(ctx.req, input.locale);
      let decor: StoredDecor | null = readStoredDecor(media.meta);
      const firstCompute = !decor;

      if (!decor) {
        // Only the uncached path spends, so only it is limited: switching
        // markets or reopening the panel reads the cached analysis.
        await enforceTrpc("aiDecorPlan", ctx.user.id);
        try {
          const result = await analyzeAndStoreDecor(media, {
            locale,
            setting: media.design.setting,
          });
          decor = result.decor;
          if (!result.stored) {
            // The couple still gets their plan; the next open pays again.
            reportError("decor_plan.cache_write_failed", result.error, {
              mediaId: media.id,
            });
          }
        } catch (err) {
          reportError("decor_plan.analyze_failed", err, {
            mediaId: media.id,
            userId: ctx.user.id,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "DECOR_PLAN_FAILED",
          });
        }
      }

      const market =
        input.market ?? marketForCountry(resolveCountryFromRequest(ctx.req));
      const plan = computeDecorPlan(decor, {
        guestCount: media.design.guest_count,
        size: media.design.size,
        setting: media.design.setting,
        market,
      });

      if (firstCompute) {
        await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_DECOR_PLAN_VIEWED, {
          design_id: media.design.id,
          media_id: media.id,
          market,
          items: plan.items.length,
          viewer: isOwner ? "owner" : "admin",
        });
      }

      const { questions, locale: questionsLocale, ...seen } = decor;
      return {
        plan,
        // Questions are written in one language when the render is first
        // read. In any other, the UI shows its own standard questions
        // rather than paying for a second read.
        questions: questionsLocale === locale ? questions : [],
        seen: {
          flowers: seen.flowers,
          tableShape: seen.table_shape,
          chairStyle: seen.chair_style,
          floralDensity: seen.floral_density,
        },
        markets: DECOR_MARKET_OPTIONS,
      };
    }),
});
