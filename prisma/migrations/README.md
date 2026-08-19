# Migrations

This directory was empty until 2026-08-20: the schema had been applied with
`prisma db push` plus hand-written SQL under `supabase/migrations/`, with no
ordered history and nothing checking for drift.

That caught up with us. `prisma db push` now **fails** against production —
the live database and the Prisma schema have diverged, and closing the gap
would rewrite `vision_packs` timestamp columns from `timestamptz` to
`timestamp(3)`, destroying timezone information on a live payments table.
Postgres refuses it outright because an RLS policy depends on one of the
columns. See the drift ticket in Linear.

Until that is resolved, apply schema changes **surgically**:

1. Generate the delta:
   `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
2. Read it. Keep only the statements belonging to your change — the delta will
   also contain the pre-existing drift, which you must not apply.
3. Check `prisma migrate diff` output for a `CreateEnum` section. It has been
   observed to omit new enum types entirely; write those by hand, idempotently.
4. Apply with `prisma db execute --file <file>` (datasource comes from
   `prisma.config.ts`).
5. Re-run the diff and confirm your objects no longer appear in it.
6. Record the SQL you actually ran in a directory here.

Files in this directory are a record of what was applied, not a Prisma Migrate
history — `prisma migrate deploy` is not wired up.
