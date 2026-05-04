/**
 * Seed the three fixed *@test.zaffa auth users consumed by the Playwright
 * money-path specs. Idempotent: safe to run on every CI invocation.
 *
 * What this does, and why it's two writes per user:
 *   1. Creates (or password-resets) the auth.users row in the Supabase
 *      project pointed at by NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *      This is what makes `supabase.auth.signInWithPassword` succeed in
 *      tests/e2e/auth.setup.ts.
 *   2. Upserts a matching row in `profiles` through Prisma (DATABASE_URL).
 *      In CI that DATABASE_URL points at an ephemeral Postgres service
 *      container — not the Supabase project — so the trigger that auto-
 *      creates a profile on auth.users insert does NOT fire against it.
 *      We insert explicitly with the role the test suite expects.
 *
 * Running locally is fine too: DATABASE_URL points at your Supabase Postgres
 * instead, so upsert #2 either collides harmlessly with the trigger's row
 * (same PK) or creates it if the trigger hasn't fired yet.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL
 *   E2E_TEST_PASSWORD
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../src/generated/prisma/client";

interface SeedRole {
  email: string;
  role: UserRole;
  full_name: string;
}

const ROLES: SeedRole[] = [
  { email: "client@test.zaffa", role: UserRole.client, full_name: "E2E Client" },
  { email: "planner@test.zaffa", role: UserRole.planner, full_name: "E2E Planner" },
  { email: "admin@test.zaffa", role: UserRole.admin, full_name: "E2E Admin" },
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var "${name}". seed-e2e-auth needs ` +
        `NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, ` +
        `and E2E_TEST_PASSWORD to be set.`,
    );
  }
  return v;
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const password = requireEnv("E2E_TEST_PASSWORD");

  // Temporary diagnostic for the first CI run — log lengths + the first
  // and last bytes as hex so we can spot trailing whitespace / encoding
  // issues without leaking the actual secret. Remove once E2E is stable.
  const diag = (label: string, v: string) => {
    const b = Buffer.from(v, "utf-8");
    const head = b.slice(0, 4).toString("hex");
    const tail = b.slice(Math.max(0, b.length - 4)).toString("hex");
    console.log(
      `[seed-e2e-auth] ${label}: len=${b.length} head=${head} tail=${tail}`,
    );
  };
  diag("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
  diag("SUPABASE_SERVICE_ROLE_KEY", serviceKey);
  diag("E2E_TEST_PASSWORD", password);

  const connectionString =
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "seed-e2e-auth needs DATABASE_URL (or DIRECT_DATABASE_URL) set to the " +
        "target business-data Postgres.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const role of ROLES) {
      // `listUsers` pages 50 at a time by default; we only seed three known
      // emails so a couple pages is fine. We walk pages until we either find
      // the email or exhaust them.
      let existingId: string | null = null;
      for (let page = 1; page <= 50; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (error) throw error;
        const hit = data.users.find((u) => u.email === role.email);
        if (hit) {
          existingId = hit.id;
          break;
        }
        if (data.users.length < 200) break;
      }

      let userId: string;
      if (existingId) {
        // Re-assert the password so rotating E2E_TEST_PASSWORD propagates
        // without needing to delete and recreate the user.
        const { error } = await supabase.auth.admin.updateUserById(existingId, {
          password,
          email_confirm: true,
        });
        if (error) throw error;
        userId = existingId;
        console.log(`[seed-e2e-auth] refreshed ${role.email} (${userId})`);
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email: role.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: role.full_name },
        });
        if (error) throw error;
        if (!data.user) throw new Error(`createUser returned no user for ${role.email}`);
        userId = data.user.id;
        console.log(`[seed-e2e-auth] created ${role.email} (${userId})`);
      }

      await prisma.profile.upsert({
        where: { id: userId },
        update: { role: role.role, full_name: role.full_name },
        create: { id: userId, role: role.role, full_name: role.full_name },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-e2e-auth] failed:", err);
  process.exit(1);
});
