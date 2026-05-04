/**
 * One-off: rename the three E2E fixture users in prod so they don't stand
 * out as "E2E …" in the admin user list. Looks them up by email through
 * Supabase admin (so we don't depend on a stable UUID) and updates the
 * matching `profiles.full_name`. Idempotent — safe to re-run.
 *
 * Run: `npx dotenvx run --env-file=.env.local -- npx tsx scripts/rename-e2e-users.ts`
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const RENAMES: Record<string, string> = {
  "admin@test.zaffa": "Sara Ibrahim",
  "planner@test.zaffa": "Mariam Tawfik",
  "client@test.zaffa": "Ahmed Khalil",
};

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

  const emailToId = new Map<string, string>();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email && RENAMES[u.email]) emailToId.set(u.email, u.id);
    }
    if (data.users.length < 200) break;
  }

  console.log(`[rename-e2e-users] target supabase: ${supabaseUrl}`);
  console.log(`[rename-e2e-users] resolved ${emailToId.size} of ${Object.keys(RENAMES).length} users`);

  for (const [email, name] of Object.entries(RENAMES)) {
    const id = emailToId.get(email);
    if (!id) {
      console.log(`[rename-e2e-users] skip ${email} (no auth user)`);
      continue;
    }

    // Update Supabase auth user_metadata.full_name as well so the
    // on_auth_user_created trigger (which copies metadata into the profile)
    // produces the right name on any future delete + recreate cycle.
    const { error: metaErr } = await supabase.auth.admin.updateUserById(id, {
      user_metadata: { full_name: name },
    });
    if (metaErr) {
      console.warn(`[rename-e2e-users] could not update auth metadata for ${email}: ${metaErr.message}`);
    }

    const updated = await prisma.profile.updateMany({
      where: { id },
      data: { full_name: name },
    });
    console.log(
      `[rename-e2e-users] ${email} (${id.slice(0, 8)}…) -> "${name}" (profile rows updated: ${updated.count})`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
