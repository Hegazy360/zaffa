import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  // App runtime uses DATABASE_URL. In prod this should be the pooled
  // (transaction-mode, port 6543) Supavisor URL. Locally we point it at
  // `db.<projectref>.supabase.co:5432` directly to avoid a misrouting
  // bug on the shared pooler, see comment in `.env.local`.
  // DIRECT_DATABASE_URL is reserved for `prisma migrate` (it needs a
  // session-mode connection for advisory locks).
  const connectionString =
    process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_DATABASE_URL must be set");
  }

  // Cap the per-instance pg pool tightly on serverless so a burst of cold
  // starts can't pile thousands of sockets onto pgbouncer (its own
  // `max_client_conn` is finite). Locally a wider pool is fine, there's
  // only one Node process and HMR holds the global cache.
  const isServerless = Boolean(process.env.VERCEL);

  // SSL: Supabase's project-direct host (`db.<projectref>.supabase.co`)
  // serves a cert signed by Supabase's private `prod-ca-2021` CA, which is
  // not in Node's trust store. We still want TLS, just not chain
  // verification against an unknown CA. In prod we connect through
  // Supavisor (publicly-trusted cert) so we leave verification to the URL's
  // `sslmode=` semantics.
  const isDev = process.env.NODE_ENV !== "production";

  const adapter = new PrismaPg({
    connectionString,
    max: isServerless ? 3 : 10,
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    ...(isDev && { ssl: { rejectUnauthorized: false } }),
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
    // `e.duration` is wall-clock ms for the query as seen by the client -
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

  // Connectivity sanity check: confirm we're talking to OUR database, not
  // some other Supabase tenant we got cross-routed to by a misconfigured
  // Supavisor pooler entry. We've been bitten by this, port 6543 of the
  // shared pooler routed our projectref to `jeancaisse_development` and
  // every Prisma query mis-targeted it, manifesting as 10s page loads.
  // Fail loudly on first use rather than silently mis-targeting tables.
  // Prod-skip: this runs on every cold start and we trust prod env.
  if (process.env.NODE_ENV !== "production" && !process.env.PRISMA_SKIP_DB_CHECK) {
    void verifyConnectedDatabase(client);
  }

  return client;
}

let dbCheckPromise: Promise<void> | null = null;
async function verifyConnectedDatabase(client: PrismaClient): Promise<void> {
  if (dbCheckPromise) return dbCheckPromise;
  dbCheckPromise = (async () => {
    try {
      // `profiles` is a table we own and that no other tenant DB will have
      // with the same row shape. If it's missing, we're plainly on the
      // wrong DB, bail with a clear error instead of letting the app
      // limp along issuing failed queries against unfamiliar tables.
      const rows = await client.$queryRawUnsafe<
        { ok: boolean; db: string }[]
      >(
        "select to_regclass('public.profiles') is not null as ok, current_database() as db",
      );
      const row = rows[0];
      if (!row?.ok) {
        const msg =
          `[prisma] Connected to '${row?.db ?? "?"}' but it has no public.profiles table. ` +
          `Your DATABASE_URL is pointed at the wrong database, likely a Supabase ` +
          `pooler routing issue. Check .env.local and confirm with ` +
          `\`psql "$DATABASE_URL" -c "select current_database()"\`.`;
        console.error(msg);
        throw new Error(msg);
      }
    } catch (err) {
      // Surface the failure but don't crash the dev server, a transient
      // network blip on boot shouldn't take everything down.
      console.error("[prisma] Database sanity check failed:", err);
    }
  })();
  return dbCheckPromise;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
