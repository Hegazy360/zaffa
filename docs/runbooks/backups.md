# Backups + restore runbook

> Status: ready for soft-launch. Walk through it dry-run every quarter and after any major schema change.

## What is backed up

| Data | Mechanism | Owner | Notes |
|---|---|---|---|
| Postgres (Supabase) | Supabase **PITR** (Point-In-Time Recovery) | Supabase project settings → Database → Backups | Enable **PITR (7-day)** on the Pro plan before launch. Daily snapshots are automatic but PITR is what saves us from accidental `DELETE FROM payments`. |
| Stripe | Stripe-side ledger | Stripe | Source of truth for payments — we just mirror into `payments` + `payment_refunds` via webhooks. |
| Cloudinary uploads (avatars, mood boards, render images) | Cloudinary's own redundancy | Cloudinary | We never delete originals; restore = re-derive URL from `media_url` in DB. |
| Resend transactional sends | Resend log retention (30 days) | Resend | For audit only; not a customer data store. |

## Pre-launch checklist

- [ ] Upgrade Supabase project to **Pro** and toggle PITR on (7 day window minimum).
- [ ] Save a copy of `DATABASE_URL`, `DIRECT_URL`, and the project's `service_role` key in 1Password under "Zaffa / production".
- [ ] Confirm `supabase` CLI is installed locally (`brew install supabase/tap/supabase`) and `supabase link` is run against the production project for at least one engineer.
- [ ] Bookmark the **Stripe Dashboard → Developers → Webhooks** page and ensure the production endpoint is enabled (idempotency makes a replay safe — see `src/app/api/webhooks/stripe/route.ts`).

## Recovery scenarios

### 1. Accidentally truncated a table

1. In Supabase Dashboard → Database → Backups → **Restore Point in Time**, pick a timestamp ~30 seconds before the bad query.
2. Restores are full-DB and take 5–15 minutes. Plan for read-only mode during the restore window: in `vercel.json` flip `RESTORE_MODE=true` and toggle the marketing pages-only build.
3. After restore, re-apply any migrations that were merged after the snapshot from `supabase/migrations/`.

### 2. A bad migration silently broke production

1. Check `git log -- supabase/migrations/` to identify the offending file.
2. Roll forward with a *new* SQL file that undoes the change — never edit historical migration files.
3. Apply via `supabase db push` (or paste in SQL editor).
4. Update `prisma/schema.prisma` to match and ship a follow-up release.

### 3. Stripe webhook backlog (e.g. our deploy was down for 30 min)

1. Stripe automatically retries failed webhooks for 3 days.
2. Manual replay: Stripe Dashboard → Developers → Webhooks → endpoint → **Failed events** → "Send test webhook" or "Resend".
3. The handler is idempotent (`stripe_webhook_events` table), so replays are safe — duplicates short-circuit at the insert.

### 4. Forgot to set `CRON_SECRET` in production

The instrumentation (`src/instrumentation.ts`) refuses to boot without required env vars in production. Fix in Vercel → Project → Settings → Environment Variables and redeploy.

## Audit log

We don't have a dedicated `audit_log` table yet (P2). Until then:

- Stripe-side history covers all payment / refund / dispute actions.
- `stripe_webhook_events` covers what we processed.
- Supabase's auth.users has sign-in history.
- Application server logs on Vercel → Project → Logs (24h retention by default; bump to 30d on the Pro plan).

## Practice the restore

Once a quarter, restore the **staging** project to a 1-hour-old PITR snapshot and verify:

1. Sign in works.
2. The most recent installment shows in `/dashboard/client/...`.
3. A Stripe webhook replay creates exactly one `payments` row update.

Document the time-to-restore in this file at the bottom of each rehearsal.
