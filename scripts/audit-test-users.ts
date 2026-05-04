/**
 * Audit (read-only) what's in production for the test users that were
 * accidentally seeded into prod by `prisma/seed.ts` and
 * `prisma/seed-e2e-auth.ts`.
 *
 * Prints, per profile:
 *  - role, full_name, created_at
 *  - whether an auth.users row exists for it
 *  - counts of the most "destructive to lose" related rows
 *    (events, proposals, payments, vendor engagements, payouts)
 *
 * Run: `npx dotenvx run --env-file=.env.local -- npx tsx scripts/audit-test-users.ts`
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const SEED_PROFILE_IDS = [
  // Planners (prisma/seed.ts)
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
  "33333333-3333-3333-3333-333333333333",
  "44444444-4444-4444-4444-444444444444",
  "55555555-5555-5555-5555-555555555555",
  "66666666-6666-6666-6666-666666666666",
  // Vendors (prisma/seed.ts)
  "77777777-7777-7777-7777-777777777771",
  "77777777-7777-7777-7777-777777777772",
  "77777777-7777-7777-7777-777777777773",
  "77777777-7777-7777-7777-777777777774",
  "77777777-7777-7777-7777-777777777775",
  "77777777-7777-7777-7777-777777777776",
  "77777777-7777-7777-7777-777777777777",
  "77777777-7777-7777-7777-777777777778",
];

const E2E_EMAILS = [
  "client@test.zaffa",
  "planner@test.zaffa",
  "admin@test.zaffa",
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var "${name}"`);
  return v;
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const connectionString =
    process.env.DIRECT_DATABASE_URL ?? requireEnv("DATABASE_URL");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  // Resolve E2E auth user IDs by email.
  const emailToId = new Map<string, string>();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email && E2E_EMAILS.includes(u.email)) emailToId.set(u.email, u.id);
    }
    if (data.users.length < 200) break;
  }

  const e2eIds = Array.from(emailToId.values());
  const allIds = [...SEED_PROFILE_IDS, ...e2eIds];

  console.log(`[audit] Supabase project: ${supabaseUrl}`);
  console.log(`[audit] Hardcoded seed profile IDs: ${SEED_PROFILE_IDS.length}`);
  console.log(`[audit] E2E auth users resolved: ${e2eIds.length} (${[...emailToId.entries()].map(([e, i]) => `${e}=${i.slice(0, 8)}…`).join(", ")})`);
  console.log("");

  for (const id of allIds) {
    const profile = await prisma.profile.findUnique({
      where: { id },
      include: { planner_profile: true, vendor_profile: true },
    });
    const authUser = await supabase.auth.admin.getUserById(id);
    const authExists = !!authUser.data.user;

    if (!profile) {
      console.log(`- ${id}  [no profile]  auth=${authExists}`);
      continue;
    }

    // Counts of meaningful associated rows.
    const [clientEvents, sentMessages, plannerEvents, plannerProposals, plannerSchedules, plannerPayouts, plannerEngagements, vendorEngagements, vendorPayouts, eventVendors, notifications] =
      await Promise.all([
        prisma.event.count({ where: { client_id: id } }),
        prisma.message.count({ where: { sender_id: id } }),
        profile.planner_profile
          ? prisma.event.count({
              where: { planner_id: profile.planner_profile.id },
            })
          : Promise.resolve(0),
        profile.planner_profile
          ? prisma.proposal.count({
              where: { planner_id: profile.planner_profile.id },
            })
          : Promise.resolve(0),
        profile.planner_profile
          ? prisma.paymentSchedule.count({
              where: { planner_id: profile.planner_profile.id },
            })
          : Promise.resolve(0),
        profile.planner_profile
          ? prisma.payout.count({
              where: { planner_id: profile.planner_profile.id },
            })
          : Promise.resolve(0),
        profile.planner_profile
          ? prisma.vendorEngagement.count({
              where: { planner_id: profile.planner_profile.id },
            })
          : Promise.resolve(0),
        profile.vendor_profile
          ? prisma.vendorEngagement.count({
              where: { vendor_id: profile.vendor_profile.id },
            })
          : Promise.resolve(0),
        profile.vendor_profile
          ? prisma.payout.count({
              where: { vendor_id: profile.vendor_profile.id },
            })
          : Promise.resolve(0),
        profile.vendor_profile
          ? prisma.eventVendor.count({
              where: { vendor_id: profile.vendor_profile.id },
            })
          : Promise.resolve(0),
        prisma.notification.count({ where: { user_id: id } }),
      ]);

    const summary = [
      `client_events=${clientEvents}`,
      `messages=${sentMessages}`,
      `planner_events=${plannerEvents}`,
      `proposals=${plannerProposals}`,
      `schedules=${plannerSchedules}`,
      `planner_payouts=${plannerPayouts}`,
      `planner_engagements=${plannerEngagements}`,
      `vendor_engagements=${vendorEngagements}`,
      `vendor_payouts=${vendorPayouts}`,
      `event_vendors=${eventVendors}`,
      `notifications=${notifications}`,
    ].join(" ");
    console.log(
      `- ${id}  ${profile.role.padEnd(7)} ${profile.full_name.padEnd(28)} auth=${authExists}  ${summary}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
