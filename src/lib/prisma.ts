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
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
