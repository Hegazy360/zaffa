import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { createClient } from "@/lib/supabase/server";

/**
 * Slim user shape derived from the verified access-token JWT. Only the
 * fields actually consumed by routers (id, email) are surfaced here.
 * `null` for anonymous requests.
 */
export type TRPCUser = { id: string; email: string | null } | null;

interface CreateTRPCContextArgs {
  /** The fetch Request when called via the route handler — used to read
   *  per-request signals like the country cookie or geo headers without
   *  importing `next/headers` deep inside individual procedures. */
  req?: Request;
}

export async function createTRPCContext(args: CreateTRPCContextArgs = {}) {
  const supabase = await createClient();
  // `getClaims()` verifies the JWT signature locally against the project's
  // published JWK (cached after the first fetch). No Supabase Auth API
  // round-trip per request — saves ~100–200ms per tRPC batch from outside
  // the EU. For procedures that need the *latest* user state (e.g. just-
  // changed email), call `supabase.auth.getUser()` ad-hoc inside the
  // procedure instead of pulling it through the shared context.
  const { data, error } = await supabase.auth.getClaims();
  let user: TRPCUser = null;
  if (!error && data?.claims?.sub) {
    user = {
      id: data.claims.sub,
      email:
        typeof data.claims.email === "string" ? data.claims.email : null,
    };
  }

  return { supabase, user, req: args.req ?? null };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
