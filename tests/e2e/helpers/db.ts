/**
 * Direct SQL (via node-postgres) for E2E assertions.
 *
 * We intentionally avoid importing the generated Prisma client here because
 * it emits ESM-only syntax (`import.meta.url`) that trips Playwright's CJS
 * test runner. For a handful of targeted read-only assertions, raw SQL is
 * lighter, faster, and sidesteps module-interop pain altogether.
 *
 * All helpers use the same `DATABASE_URL` the app is running against (Docker
 * Postgres locally, ephemeral service container in CI).
 */

import { Pool } from "pg";

let cached: Pool | null = null;

function getPool(): Pool {
  if (cached) return cached;
  const connectionString =
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "E2E DB helpers need DATABASE_URL (or DIRECT_DATABASE_URL). " +
        "Run via `npm run test:e2e:local` so .env.test is loaded.",
    );
  }
  cached = new Pool({ connectionString, max: 2 });
  return cached;
}

export async function closeTestDb(): Promise<void> {
  if (cached) {
    await cached.end();
    cached = null;
  }
}

/**
 * Fetches the `PlannerProfile.id` for the E2E planner user. This is the key
 * scoping id for every other test query — `planner_id` on events, proposals,
 * schedules, payments, payouts all reference `PlannerProfile.id`, NOT the
 * auth user id.
 *
 * We look up by the distinctive `business_name` seeded in
 * `prisma/seed-e2e-auth.ts` because `profiles` has no email column (emails
 * live in Supabase `auth.users`, which is a different DB in CI).
 */
export async function getE2EPlannerProfileId(): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT id FROM planner_profiles WHERE business_name = $1 LIMIT 1`,
    ["E2E Planner Co."],
  );
  if (rows.length === 0) {
    throw new Error(
      "getE2EPlannerProfileId: no PlannerProfile found. Did " +
        "`npm run db:seed-e2e-users` run with the updated seed-e2e-auth.ts?",
    );
  }
  return rows[0].id;
}

export interface ProposalSnapshot {
  proposalStatus: string | null;
  scheduleStatus: string | null;
  installmentCount: number;
  installmentIds: string[];
}

/** Snapshot of the latest proposal + schedule for a (event, planner) pair. */
export async function getProposalSnapshot(
  eventId: string,
  plannerProfileId: string,
): Promise<ProposalSnapshot | null> {
  const { rows: proposalRows } = await getPool().query<{
    id: string;
    status: string;
  }>(
    `SELECT id, status FROM proposals
      WHERE event_id = $1 AND planner_id = $2
      ORDER BY created_at DESC LIMIT 1`,
    [eventId, plannerProfileId],
  );
  if (proposalRows.length === 0) return null;
  const proposal = proposalRows[0];

  const { rows: scheduleRows } = await getPool().query<{
    id: string;
    status: string;
  }>(
    `SELECT id, status FROM payment_schedules
      WHERE proposal_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [proposal.id],
  );
  if (scheduleRows.length === 0) {
    return {
      proposalStatus: proposal.status,
      scheduleStatus: null,
      installmentCount: 0,
      installmentIds: [],
    };
  }
  const schedule = scheduleRows[0];

  const { rows: installments } = await getPool().query<{ id: string }>(
    `SELECT id FROM payments
      WHERE schedule_id = $1
      ORDER BY created_at ASC`,
    [schedule.id],
  );
  return {
    proposalStatus: proposal.status,
    scheduleStatus: schedule.status,
    installmentCount: installments.length,
    installmentIds: installments.map((r) => r.id),
  };
}

export async function getScheduleStatus(
  eventId: string,
  plannerProfileId: string,
): Promise<string | null> {
  const { rows } = await getPool().query<{ status: string }>(
    `SELECT status FROM payment_schedules
      WHERE event_id = $1 AND planner_id = $2
      ORDER BY created_at DESC LIMIT 1`,
    [eventId, plannerProfileId],
  );
  return rows[0]?.status ?? null;
}

export async function getPaymentStatus(
  paymentId: string,
): Promise<string | null> {
  const { rows } = await getPool().query<{ status: string }>(
    `SELECT status FROM payments WHERE id = $1`,
    [paymentId],
  );
  return rows[0]?.status ?? null;
}

export interface PayoutInfo {
  payoutId: string;
  plannerId: string;
  amount: number;
}

export interface VisionPackRow {
  id: string;
  status: string;
  micrositeSlug: string | null;
  micrositePublic: boolean;
  micrositePublishedAt: Date | null;
  rendersUsed: number;
  rendersQuota: number;
  videosUsed: number;
  videosQuota: number;
}

/**
 * Resolves the Vision Pack row for the recipient that owns a given
 * email in `auth.users`. Returns null when the user has never bought
 * a pack. Used by `pack-path.spec.ts` to wait on webhook activation.
 *
 * The query joins on `auth.users` because that's where Supabase stores
 * the email column — `profiles` only carries the canonical user id.
 */
export async function getVisionPackByRecipient(
  email: string,
): Promise<VisionPackRow | null> {
  const { rows } = await getPool().query<{
    id: string;
    status: string;
    microsite_slug: string | null;
    microsite_public: boolean;
    microsite_published_at: Date | null;
    renders_used: number;
    renders_quota: number;
    videos_used: number;
    videos_quota: number;
  }>(
    `SELECT vp.id, vp.status::text AS status, vp.microsite_slug,
            vp.microsite_public, vp.microsite_published_at,
            vp.renders_used, vp.renders_quota,
            vp.videos_used, vp.videos_quota
       FROM vision_packs vp
       JOIN auth.users u ON u.id = vp.recipient_user_id
      WHERE u.email = $1
      ORDER BY vp.created_at DESC LIMIT 1`,
    [email],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    status: r.status,
    micrositeSlug: r.microsite_slug,
    micrositePublic: r.microsite_public,
    micrositePublishedAt: r.microsite_published_at,
    rendersUsed: Number(r.renders_used),
    rendersQuota: Number(r.renders_quota),
    videosUsed: Number(r.videos_used),
    videosQuota: Number(r.videos_quota),
  };
}

/** Lookup a Vision Pack by id. Used after we've cached the id. */
export async function getVisionPackById(
  packId: string,
): Promise<VisionPackRow | null> {
  const { rows } = await getPool().query<{
    id: string;
    status: string;
    microsite_slug: string | null;
    microsite_public: boolean;
    microsite_published_at: Date | null;
    renders_used: number;
    renders_quota: number;
    videos_used: number;
    videos_quota: number;
  }>(
    `SELECT id, status::text AS status, microsite_slug,
            microsite_public, microsite_published_at,
            renders_used, renders_quota,
            videos_used, videos_quota
       FROM vision_packs WHERE id = $1`,
    [packId],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    status: r.status,
    micrositeSlug: r.microsite_slug,
    micrositePublic: r.microsite_public,
    micrositePublishedAt: r.microsite_published_at,
    rendersUsed: Number(r.renders_used),
    rendersQuota: Number(r.renders_quota),
    videosUsed: Number(r.videos_used),
    videosQuota: Number(r.videos_quota),
  };
}

/**
 * Returns the payout linked to a given installment (or null if none yet).
 * Used by the admin step to verify a payout row was persisted.
 */
export async function getPayoutForInstallment(
  installmentId: string,
): Promise<PayoutInfo | null> {
  const { rows } = await getPool().query<{
    payout_id: string | null;
  }>(`SELECT payout_id FROM payments WHERE id = $1`, [installmentId]);
  const payoutId = rows[0]?.payout_id ?? null;
  if (!payoutId) return null;

  const { rows: payoutRows } = await getPool().query<{
    id: string;
    planner_id: string | null;
    amount: string;
  }>(`SELECT id, planner_id, amount FROM payouts WHERE id = $1`, [payoutId]);
  if (payoutRows.length === 0) return null;
  const p = payoutRows[0];
  if (!p.planner_id) return null;
  return {
    payoutId: p.id,
    plannerId: p.planner_id,
    amount: Number(p.amount),
  };
}
