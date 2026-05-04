/**
 * One-off cleanup: delete the test users that `prisma/seed.ts` and
 * `prisma/seed-e2e-auth.ts` accidentally seeded into the production
 * Supabase project (ncgvdsxthwhvqbmlfsmg).
 *
 * What this removes:
 *   1. The 14 hardcoded "demo" planner + vendor profiles from `prisma/seed.ts`.
 *      These have profile rows only (no auth.users counterpart) and are
 *      what makes the admin user-detail page throw "user not found" when
 *      clicked.
 *   2. The three E2E fixture users (`admin@test.zaffa`, `planner@test.zaffa`,
 *      `client@test.zaffa`), both their `profiles` row and their `auth.users`
 *      row in Supabase.
 *
 * Profile child rows (planner_profiles, vendor_profiles, portfolio items,
 * vendor services, etc.) all cascade on Profile delete per
 * `prisma/schema.prisma`, so we only need a single deleteMany.
 *
 * Run: `npx dotenvx run --env-file=.env.local -- npx tsx scripts/delete-test-users.ts`
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const SEED_PROFILE_IDS = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
  "33333333-3333-3333-3333-333333333333",
  "44444444-4444-4444-4444-444444444444",
  "55555555-5555-5555-5555-555555555555",
  "66666666-6666-6666-6666-666666666666",
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

  console.log(`[delete-test-users] target supabase: ${supabaseUrl}`);

  // 1) Resolve E2E auth user IDs by email.
  const e2eIds: string[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email && E2E_EMAILS.includes(u.email)) e2eIds.push(u.id);
    }
    if (data.users.length < 200) break;
  }
  console.log(`[delete-test-users] resolved ${e2eIds.length} E2E auth users`);

  const allProfileIds = [...SEED_PROFILE_IDS, ...e2eIds];

  // 2) Null out any prospect.signed_up_user_id pointers (no FK, but keep clean).
  const prospectsCleared = await prisma.prospect.updateMany({
    where: { signed_up_user_id: { in: allProfileIds } },
    data: { signed_up_user_id: null },
  });
  if (prospectsCleared.count > 0) {
    console.log(
      `[delete-test-users] cleared ${prospectsCleared.count} prospect.signed_up_user_id link(s)`,
    );
  }

  // 3) Delete profile rows. Cascades to planner_profiles, vendor_profiles,
  //    portfolio items, vendor services, notifications, etc.
  const deleted = await prisma.profile.deleteMany({
    where: { id: { in: allProfileIds } },
  });
  console.log(`[delete-test-users] deleted ${deleted.count} profile row(s)`);

  // 4) Delete the matching auth.users rows for the E2E fixtures.
  for (const id of e2eIds) {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) {
      console.warn(`[delete-test-users] could not delete auth user ${id}: ${error.message}`);
    } else {
      console.log(`[delete-test-users] deleted auth user ${id}`);
    }
  }

  await prisma.$disconnect();
  console.log("[delete-test-users] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
