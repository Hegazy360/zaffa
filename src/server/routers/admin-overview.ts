import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

async function assertAdmin(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
}

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// Generate the last N daily timestamps (UTC midnight) for sparkline buckets.
function lastNDays(n: number): Date[] {
  const today = startOfDay(new Date());
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return d;
  });
}

// Sparkline shape consumed by the UI: a Date + numeric value per day.
type Spark = Array<{ d: string; v: number }>;

function bucketByDay(rows: { created_at: Date }[], n = 30): Spark {
  const days = lastNDays(n);
  const counts = new Map<string, number>(
    days.map((d) => [d.toISOString().slice(0, 10), 0]),
  );
  for (const r of rows) {
    const key = startOfDay(r.created_at).toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return days.map((d) => {
    const key = d.toISOString().slice(0, 10);
    return { d: key, v: counts.get(key) ?? 0 };
  });
}

function sumByDay(
  rows: { created_at: Date; amount: number }[],
  n = 30,
): Spark {
  const days = lastNDays(n);
  const sums = new Map<string, number>(
    days.map((d) => [d.toISOString().slice(0, 10), 0]),
  );
  for (const r of rows) {
    const key = startOfDay(r.created_at).toISOString().slice(0, 10);
    if (sums.has(key)) sums.set(key, (sums.get(key) ?? 0) + r.amount);
  }
  return days.map((d) => {
    const key = d.toISOString().slice(0, 10);
    return { d: key, v: sums.get(key) ?? 0 };
  });
}

export const adminOverviewRouter = router({
  // Lightweight KPI rollup. Each metric returns:
  //   { value: number, delta30: number, spark: Spark }
  // delta30 is the 30-day trailing percentage change vs the prior 30-day
  // window. Sparkline is a simple daily count for the trailing 30 days.
  kpis: protectedProcedure.query(async ({ ctx }) => {
    await assertAdmin(ctx.user.id);
    const now = new Date();
    const thirty = new Date(now.getTime() - DAYS_30);
    const sixty = new Date(now.getTime() - 2 * DAYS_30);

    const [
      profilesAll,
      events,
      proposals,
      payments,
      vendorReleases,
      pendingReleases,
    ] = await Promise.all([
      prisma.profile.findMany({
        select: { id: true, role: true, created_at: true },
      }),
      prisma.event.findMany({
        select: { id: true, status: true, created_at: true },
      }),
      prisma.proposal.findMany({
        select: {
          status: true,
          created_at: true,
          accepted_at: true,
        },
      }),
      prisma.payment.findMany({
        where: { status: "paid" },
        select: {
          amount: true,
          currency: true,
          paid_at: true,
          created_at: true,
        },
      }),
      prisma.vendorRelease.findMany({
        select: {
          status: true,
          amount: true,
          currency: true,
          requested_at: true,
        },
      }),
      prisma.payment.aggregate({
        where: { status: "paid", payout_id: null },
        _sum: { net_to_planner_amount: true },
      }),
    ]);

    function delta(curr: number, prev: number): number {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    }
    function inWindow(d: Date | null, from: Date, to: Date) {
      return d != null && d >= from && d < to;
    }

    const counts = {
      client: 0,
      planner: 0,
      vendor: 0,
      admin: 0,
    } as Record<string, number>;
    for (const p of profilesAll) counts[p.role] += 1;

    const last30Profiles = profilesAll.filter((p) =>
      inWindow(p.created_at, thirty, now),
    );
    const prev30Profiles = profilesAll.filter((p) =>
      inWindow(p.created_at, sixty, thirty),
    );

    // GMV (sum of paid Payment amounts) and net (after platform fee) lifetime
    const gmvLifetime = payments.reduce((s, p) => s + Number(p.amount), 0);
    const gmv30 = payments
      .filter((p) => inWindow(p.paid_at, thirty, now))
      .reduce((s, p) => s + Number(p.amount), 0);
    const gmvPrev30 = payments
      .filter((p) => inWindow(p.paid_at, sixty, thirty))
      .reduce((s, p) => s + Number(p.amount), 0);

    // Active events = not draft/cancelled/completed
    const activeEvents = events.filter(
      (e) =>
        e.status === "planning" ||
        e.status === "confirmed" ||
        e.status === "in_progress",
    ).length;

    const acceptedProposals = proposals.filter((p) => p.accepted_at != null);
    const acceptRate =
      proposals.length === 0
        ? 0
        : Math.round((acceptedProposals.length / proposals.length) * 100);
    const avgDaysToAccept = acceptedProposals.length
      ? acceptedProposals.reduce((s, p) => {
          const ms =
            (p.accepted_at!.getTime() - p.created_at.getTime()) /
            (1000 * 60 * 60 * 24);
          return s + ms;
        }, 0) / acceptedProposals.length
      : 0;

    const pendingPlannerPayout = Number(
      pendingReleases._sum.net_to_planner_amount ?? 0,
    );
    const pendingVendorPayout = vendorReleases
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + Number(r.amount), 0);

    return {
      users: {
        clients: {
          value: counts.client ?? 0,
          delta30: delta(
            last30Profiles.filter((p) => p.role === "client").length,
            prev30Profiles.filter((p) => p.role === "client").length,
          ),
          spark: bucketByDay(
            profilesAll.filter((p) => p.role === "client"),
          ),
        },
        planners: {
          value: counts.planner ?? 0,
          delta30: delta(
            last30Profiles.filter((p) => p.role === "planner").length,
            prev30Profiles.filter((p) => p.role === "planner").length,
          ),
          spark: bucketByDay(
            profilesAll.filter((p) => p.role === "planner"),
          ),
        },
        vendors: {
          value: counts.vendor ?? 0,
          delta30: delta(
            last30Profiles.filter((p) => p.role === "vendor").length,
            prev30Profiles.filter((p) => p.role === "vendor").length,
          ),
          spark: bucketByDay(
            profilesAll.filter((p) => p.role === "vendor"),
          ),
        },
      },
      events: {
        active: activeEvents,
        total: events.length,
        delta30: delta(
          events.filter((e) => inWindow(e.created_at, thirty, now)).length,
          events.filter((e) => inWindow(e.created_at, sixty, thirty)).length,
        ),
        spark: bucketByDay(events),
      },
      gmv: {
        lifetime: gmvLifetime,
        last30: gmv30,
        delta30: delta(gmv30, gmvPrev30),
        spark: sumByDay(
          payments
            .filter((p) => p.paid_at != null)
            .map((p) => ({
              created_at: p.paid_at as Date,
              amount: Number(p.amount),
            })),
        ),
      },
      proposals: {
        total: proposals.length,
        accepted: acceptedProposals.length,
        acceptRate,
        avgDaysToAccept: Math.round(avgDaysToAccept * 10) / 10,
        spark: bucketByDay(proposals),
      },
      payouts: {
        pendingPlanner: pendingPlannerPayout,
        pendingVendor: pendingVendorPayout,
      },
    };
  }),

  // Cross-table activity feed. We pull a recent slice from each of the
  // "interesting" tables, tag them with a type, then merge by created_at.
  // Pagination is cursor-based on the merged stream's earliest timestamp.
  activity: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(10).max(100).default(50),
          before: z.coerce.date().optional(),
          types: z
            .array(
              z.enum([
                "signup",
                "event",
                "proposal",
                "payment",
                "engagement",
                "release",
                "review",
              ]),
            )
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const limit = input?.limit ?? 50;
      const before = input?.before ?? new Date();
      const wantTypes: Set<string> | null =
        input?.types && input.types.length > 0
          ? new Set(input.types)
          : null;

      const want = (t: string) => !wantTypes || wantTypes.has(t);
      const slice = limit * 2; // overfetch each table; we trim after merge

      const [signups, events, proposals, payments, engagements, releases, reviews] =
        await Promise.all([
          want("signup")
            ? prisma.profile.findMany({
                where: { created_at: { lt: before } },
                orderBy: { created_at: "desc" },
                take: slice,
                select: {
                  id: true,
                  full_name: true,
                  role: true,
                  avatar_url: true,
                  created_at: true,
                },
              })
            : Promise.resolve([]),
          want("event")
            ? prisma.event.findMany({
                where: { created_at: { lt: before } },
                orderBy: { created_at: "desc" },
                take: slice,
                select: {
                  id: true,
                  title: true,
                  event_type: true,
                  status: true,
                  client: { select: { id: true, full_name: true } },
                  created_at: true,
                },
              })
            : Promise.resolve([]),
          want("proposal")
            ? prisma.proposal.findMany({
                where: { created_at: { lt: before } },
                orderBy: { created_at: "desc" },
                take: slice,
                select: {
                  id: true,
                  status: true,
                  quote_amount: true,
                  quote_currency: true,
                  event: { select: { id: true, title: true } },
                  planner: {
                    select: { id: true, business_name: true },
                  },
                  created_at: true,
                },
              })
            : Promise.resolve([]),
          want("payment")
            ? prisma.payment.findMany({
                where: {
                  created_at: { lt: before },
                  status: { in: ["paid", "refunded"] },
                },
                orderBy: { created_at: "desc" },
                take: slice,
                select: {
                  id: true,
                  label: true,
                  amount: true,
                  currency: true,
                  status: true,
                  event: { select: { id: true, title: true } },
                  schedule: {
                    select: {
                      planner: {
                        select: { id: true, business_name: true },
                      },
                    },
                  },
                  paid_at: true,
                  created_at: true,
                },
              })
            : Promise.resolve([]),
          want("engagement")
            ? prisma.vendorEngagement.findMany({
                where: { created_at: { lt: before } },
                orderBy: { created_at: "desc" },
                take: slice,
                select: {
                  id: true,
                  title: true,
                  status: true,
                  total_amount: true,
                  currency: true,
                  vendor: { select: { id: true, business_name: true } },
                  planner: {
                    select: { id: true, business_name: true },
                  },
                  event: { select: { id: true, title: true } },
                  created_at: true,
                },
              })
            : Promise.resolve([]),
          want("release")
            ? prisma.vendorRelease.findMany({
                where: { requested_at: { lt: before } },
                orderBy: { requested_at: "desc" },
                take: slice,
                select: {
                  id: true,
                  label: true,
                  amount: true,
                  currency: true,
                  status: true,
                  vendor: { select: { id: true, business_name: true } },
                  engagement: {
                    select: {
                      id: true,
                      event: { select: { id: true, title: true } },
                    },
                  },
                  requested_at: true,
                },
              })
            : Promise.resolve([]),
          want("review")
            ? prisma.review.findMany({
                where: { created_at: { lt: before } },
                orderBy: { created_at: "desc" },
                take: slice,
                select: {
                  id: true,
                  rating: true,
                  comment: true,
                  author: { select: { id: true, full_name: true } },
                  planner: {
                    select: { id: true, business_name: true },
                  },
                  event: { select: { id: true, title: true } },
                  created_at: true,
                },
              })
            : Promise.resolve([]),
        ]);

      type FeedRow = { type: string; at: Date; data: unknown };
      const merged: FeedRow[] = [];

      for (const r of signups)
        merged.push({ type: "signup", at: r.created_at, data: r });
      for (const r of events)
        merged.push({ type: "event", at: r.created_at, data: r });
      for (const r of proposals)
        merged.push({ type: "proposal", at: r.created_at, data: r });
      for (const r of payments)
        merged.push({ type: "payment", at: r.created_at, data: r });
      for (const r of engagements)
        merged.push({ type: "engagement", at: r.created_at, data: r });
      for (const r of releases)
        merged.push({
          type: "release",
          at: r.requested_at,
          data: r,
        });
      for (const r of reviews)
        merged.push({ type: "review", at: r.created_at, data: r });

      merged.sort((a, b) => b.at.getTime() - a.at.getTime());
      const items = merged.slice(0, limit);
      const nextCursor =
        merged.length > limit
          ? items[items.length - 1].at
          : null;

      return { items, nextCursor };
    }),

  // Searchable user list. Returns lightweight rows for the table.
  usersList: protectedProcedure
    .input(
      z
        .object({
          q: z.string().max(200).optional(),
          role: z.enum(["client", "planner", "vendor", "admin"]).optional(),
          limit: z.number().int().min(1).max(200).default(50),
          cursor: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const limit = input?.limit ?? 50;
      const where = {
        ...(input?.role ? { role: input.role } : {}),
        ...(input?.q
          ? {
              OR: [
                { full_name: { contains: input.q, mode: "insensitive" as const } },
                {
                  planner_profile: {
                    is: {
                      business_name: {
                        contains: input.q,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                },
                {
                  vendor_profile: {
                    is: {
                      business_name: {
                        contains: input.q,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      };

      const rows = await prisma.profile.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: limit + 1,
        ...(input?.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          role: true,
          full_name: true,
          avatar_url: true,
          locale: true,
          created_at: true,
          planner_profile: {
            select: {
              business_name: true,
              location: true,
              avg_rating: true,
              review_count: true,
              verified: true,
            },
          },
          vendor_profile: {
            select: {
              business_name: true,
              category: true,
              location: true,
              avg_rating: true,
              review_count: true,
              verified: true,
            },
          },
        },
      });

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;
      return { items, nextCursor };
    }),

  userById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const profile = await prisma.profile.findUnique({
        where: { id: input.id },
        include: {
          planner_profile: true,
          vendor_profile: true,
        },
      });
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const [events, plannerProposals, vendorEngagements, plannerEvents] =
        await Promise.all([
          prisma.event.findMany({
            where: { client_id: input.id },
            orderBy: { created_at: "desc" },
            take: 25,
            select: {
              id: true,
              title: true,
              event_type: true,
              status: true,
              event_date: true,
              created_at: true,
            },
          }),
          profile.planner_profile
            ? prisma.proposal.findMany({
                where: { planner_id: profile.planner_profile.id },
                orderBy: { created_at: "desc" },
                take: 25,
                select: {
                  id: true,
                  status: true,
                  quote_amount: true,
                  quote_currency: true,
                  event: { select: { id: true, title: true } },
                  created_at: true,
                  accepted_at: true,
                },
              })
            : Promise.resolve([]),
          profile.vendor_profile
            ? prisma.vendorEngagement.findMany({
                where: { vendor_id: profile.vendor_profile.id },
                orderBy: { created_at: "desc" },
                take: 25,
                select: {
                  id: true,
                  title: true,
                  status: true,
                  total_amount: true,
                  currency: true,
                  planner: {
                    select: { id: true, business_name: true },
                  },
                  event: { select: { id: true, title: true } },
                  created_at: true,
                },
              })
            : Promise.resolve([]),
          profile.planner_profile
            ? prisma.event.findMany({
                where: { planner_id: profile.planner_profile.id },
                orderBy: { created_at: "desc" },
                take: 25,
                select: {
                  id: true,
                  title: true,
                  event_type: true,
                  status: true,
                  event_date: true,
                  created_at: true,
                },
              })
            : Promise.resolve([]),
        ]);

      return {
        profile,
        events,
        plannerProposals,
        plannerEvents,
        vendorEngagements,
      };
    }),
});
