import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client signed with the service role key. Bypasses
 * RLS so it can perform admin actions like deleting auth.users rows.
 *
 * NEVER import this module from a client component — the service role key
 * has full access. Re-throws on missing env in production.
 */
let cached: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
