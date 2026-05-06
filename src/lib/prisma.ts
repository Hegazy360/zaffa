import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  // Prefer the pooled (transaction-mode, port 6543) connection for the app
  // runtime. The direct URL (session-mode, port 5432) is reserved for
  // migrations and is hard-capped at pool_size=15 by Supabase, which the
  // app trivially exhausts under HMR/concurrent requests.
  const connectionString =
    process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_DATABASE_URL must be set");
  }

  // Cap the per-instance pg pool tightly on serverless so a burst of cold
  // starts can't pile thousands of sockets onto pgbouncer (its own
  // `max_client_conn` is finite). Locally a wider pool is fine — there's
  // only one Node process and HMR holds the global cache.
  const isServerless = Boolean(process.env.VERCEL);

  const adapter = new PrismaPg({
    connectionString,
    max: isServerless ? 3 : 10,
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
  });

  // Opt-in query timing log. Enable with PRISMA_QUERY_LOG=1 to see every
  // statement Prisma issues plus its wall-clock duration. Anything above
  // SLOW_QUERY_MS surfaces with a "[prisma:slow]" prefix so it's easy to
  // grep dev output.
  const queryLogEnabled = process.env.PRISMA_QUERY_LOG === "1";
  const slowQueryMs = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 100);

  const client = new PrismaClient({
    adapter,
    log: queryLogEnabled
      ? [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" },
        ]
      : [{ emit: "stdout", level: "error" }],
  });

  if (queryLogEnabled) {
    // `e.duration` is wall-clock ms for the query as seen by the client —
    // includes the network round-trip to pgbouncer + Postgres exec time.
    // If duration is small but the page is still slow, the bottleneck is
    // either request count (N+1) or non-DB work.
    client.$on("query", (e) => {
      const tag = e.duration >= slowQueryMs ? "[prisma:slow]" : "[prisma]";
      console.log(
        `${tag} ${e.duration}ms  ${e.query}  ${e.params}`,
      );
    });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
