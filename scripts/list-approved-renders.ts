/**
 * Read-only: print URLs of the most recently approved AI venue renders.
 *
 * Used to manually curate which images should appear in the marketing
 * `BeginSection` collage (the four tiles next to "Your first sketch is three
 * minutes away"). The intended workflow is:
 *
 *   1. Run this script
 *   2. Pick the four URLs you want to feature
 *   3. Download them into `public/home/begin/`
 *   4. Update `STOCK_COLLAGE` in `src/components/home/begin-section.tsx`
 *      to point at the local paths
 *
 * Run:
 *   npx dotenvx run --env-file=.env.local -- npx tsx scripts/list-approved-renders.ts
 */

import { prisma } from "../src/lib/prisma";

const TAKE = 20;

async function main() {
  const designs = await prisma.venueDesign.findMany({
    where: { approved_at: { not: null } },
    orderBy: { approved_at: "desc" },
    take: TAKE,
    select: {
      id: true,
      approved_at: true,
      thumbnail: true,
      event: {
        select: {
          id: true,
          event_type: true,
          event_date: true,
        },
      },
      media: {
        where: { type: "render" },
        orderBy: { created_at: "desc" },
        take: 1,
        select: { url: true },
      },
    },
  });

  if (designs.length === 0) {
    console.log("No approved venue designs found.");
    return;
  }

  console.log(
    `Found ${designs.length} approved design(s) (most recent first):\n`,
  );

  designs.forEach((d, i) => {
    const url = d.media[0]?.url ?? d.thumbnail ?? "(no render or thumbnail)";
    const approved = d.approved_at?.toISOString().slice(0, 10) ?? "?";
    const eventType = d.event?.event_type ?? "?";
    const eventDate = d.event?.event_date?.toISOString().slice(0, 10) ?? "?";
    console.log(
      `${String(i + 1).padStart(2)}.  approved ${approved}  ${eventType}  event_date=${eventDate}`,
    );
    console.log(`    design_id: ${d.id}`);
    console.log(`    url:       ${url}`);
    console.log();
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
