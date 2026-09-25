import type { Prisma } from "@/generated/prisma/client";

// The daily anonymous-user sweep's selection (api/cron/cleanup-anon-users),
// kept out of the route file because a route may only export its handlers
// and segment config, and so it can be pinned by a test.

/**
 * Anonymous profiles past the retention window, except a couple whose
 * family link (F6) is in use: one made, or voted on, inside the window.
 * An anonymous couple may share once they pass the email gate, and the
 * delete cascades through the design to the link and every vote on it, so
 * without this a link sent to the family on day 12 went dead on day 15
 * with the votes gone. Filtered in the query rather than after it, so kept
 * couples never fill the batch and stall the sweep. Once the link has been
 * quiet for the whole window the profile is reaped as before.
 */
export function staleAnonProfilesWhere(cutoff: Date): Prisma.ProfileWhereInput {
  return {
    is_anonymous: true,
    created_at: { lt: cutoff },
    NOT: {
      venue_designs: {
        some: {
          shares: {
            some: {
              revoked_at: null,
              OR: [
                { created_at: { gte: cutoff } },
                { votes: { some: { updated_at: { gte: cutoff } } } },
              ],
            },
          },
        },
      },
    },
  };
}
