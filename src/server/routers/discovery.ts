import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import {
  DiscoveryRunStatus,
  ProspectSource,
} from "@/generated/prisma/client";
import { runDiscovery } from "@/server/services/prospects/run-discovery";
import { enforceTrpc, enforceTrpcMany } from "@/lib/rate-limit";

async function assertAdmin(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
}

const SOURCE_VALUES = Object.values(ProspectSource).filter(
  (s) => s !== ProspectSource.manual,
) as [ProspectSource, ...ProspectSource[]];

export const discoveryRouter = router({
  // Curated seed query library admins can fire with one click. Editable
  // later, for now we hardcode Egyptian-relevant defaults.
  seedQueries: protectedProcedure.query(async ({ ctx }) => {
    await assertAdmin(ctx.user.id);
    return [
      {
        source: ProspectSource.web,
        query_type: "search",
        queries: [
          "egyptian wedding planner instagram",
          "wedding photographer cairo instagram",
          "wedding videographer egypt portfolio",
          "wedding florist cairo egypt",
          "sahel north coast wedding planner",
          "el gouna wedding planner contact",
          "alexandria wedding planner whatsapp",
          "engagement party planner cairo",
          "egyptian belly dancer wedding contact",
          "wedding makeup artist cairo whatsapp",
          "wedding entertainment band cairo",
          "wedding venue cairo contact",
        ],
      },
      {
        source: ProspectSource.instagram,
        query_type: "hashtag",
        queries: [
          "weddingplanneregypt",
          "cairoweddings",
          "egyptbride",
          "sahelweddings",
          "elgounaweddings",
          "egyptianwedding",
          "northcoastweddings",
        ],
      },
      {
        source: ProspectSource.tiktok,
        query_type: "search",
        queries: [
          "wedding planner egypt",
          "cairo bride",
          "sahel wedding",
        ],
      },
      {
        source: ProspectSource.facebook,
        query_type: "search",
        queries: [
          "wedding planner cairo",
          "wedding photography egypt",
          "florist egypt weddings",
        ],
      },
      {
        source: ProspectSource.directory,
        // zafaf accepts category keywords or exact slugs; the dispatcher
        // routes anything starting with http(s):// to the generic
        // listing-page scraper.
        query_type: "zafaf",
        queries: [
          "wedding-planners",
          "wedding-organizers",
          "photographers-and-videographers",
          "flower-shops",
          "catering",
          "band-dj-and-entertainment",
          "private-wedding-venues",
          "hair-make-up",
          "bridal-car",
          "country:saudi-arabia wedding-planners",
          "country:emirates wedding-planners",
        ],
      },
    ];
  }),

  // Recent runs across all sources.
  runs: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(50),
          status: z
            .enum([
              DiscoveryRunStatus.queued,
              DiscoveryRunStatus.running,
              DiscoveryRunStatus.completed,
              DiscoveryRunStatus.failed,
            ])
            .optional(),
          source: z.enum(SOURCE_VALUES).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.discoveryRun.findMany({
        where: {
          ...(input?.status ? { status: input.status } : {}),
          ...(input?.source ? { source: input.source } : {}),
        },
        orderBy: { created_at: "desc" },
        take: input?.limit ?? 50,
        select: {
          id: true,
          source: true,
          query: true,
          query_type: true,
          depth: true,
          status: true,
          prospects_found: true,
          prospects_new: true,
          cost_usd: true,
          error: true,
          triggered_by: true,
          created_at: true,
          started_at: true,
          completed_at: true,
        },
      });
    }),

  runById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const run = await prisma.discoveryRun.findUnique({
        where: { id: input.id },
        include: {
          prospects: {
            select: {
              id: true,
              display_name: true,
              handle: true,
              source_url: true,
              email: true,
              instagram: true,
              tiktok: true,
              facebook: true,
              avatar_url: true,
              status: true,
              qualifying_score: true,
              prospect_type: true,
              vendor_category: true,
            },
            take: 200,
            orderBy: { qualifying_score: "desc" },
          },
        },
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      return run;
    }),

  // Enqueue + (optionally) run synchronously. The cron tick worker will pick
  // up anything left queued. We allow the admin to fire-and-wait via
  // `runNow: true` for fast feedback.
  enqueue: protectedProcedure
    .input(
      z.object({
        source: z.enum(SOURCE_VALUES),
        query: z.string().min(1).max(500),
        query_type: z.string().min(1).max(40).default("search"),
        // Tunes per-source depth. "deep" fans Tavily out into LLM-generated
        // query variants and walks deeper into Apify / directory pagination.
        depth: z.enum(["quick", "standard", "deep"]).default("standard"),
        runNow: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      // Per-admin throttle so a typo-loop or runaway script can't burn
      // discovery budget before anyone notices. Per-hour for bursts +
      // per-day cost ceiling.
      await enforceTrpcMany(
        [{ key: "discoveryRun" }, { key: "discoveryRunDaily" }],
        ctx.user.id,
      );
      const run = await prisma.discoveryRun.create({
        data: {
          source: input.source,
          query: input.query,
          query_type: input.query_type,
          depth: input.depth,
          triggered_by: ctx.user.id,
          status: DiscoveryRunStatus.queued,
        },
      });
      if (input.runNow) {
        // Don't await, let the UI poll. We swallow errors here since they
        // are persisted on the run row. Admin-initiated runs bypass the
        // cooldown (which only exists to throttle the background cron).
        runDiscovery(run.id, { bypassCooldown: true }).catch(() => {
          /* see DB row for error */
        });
      }
      return run;
    }),

  // Manual retry of a failed/queued run.
  retry: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      await enforceTrpcMany(
        [{ key: "discoveryRun" }, { key: "discoveryRunDaily" }],
        ctx.user.id,
      );
      const run = await prisma.discoveryRun.findUnique({
        where: { id: input.id },
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      if (run.status === DiscoveryRunStatus.running) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Run is already in progress",
        });
      }
      await prisma.discoveryRun.update({
        where: { id: input.id },
        data: {
          status: DiscoveryRunStatus.queued,
          error: null,
          started_at: null,
          completed_at: null,
          prospects_found: 0,
          prospects_new: 0,
        },
      });
      // Explicit admin retry, skip the cooldown that's only meant to throttle
      // the background cron worker.
      runDiscovery(input.id, { bypassCooldown: true }).catch(() => {
        /* see DB row for error */
      });
      return { ok: true };
    }),
});
