-- Enable RLS on every public table that doesn't already have it.
--
-- Background:
--   Supabase's database linter raises "Table public.X is public, but RLS has
--   not been enabled" for every table in the `public` schema (which PostgREST
--   exposes by default) that lacks RLS. We added a number of tables via
--   Prisma migrations after the initial supabase migration and never enabled
--   RLS on them.
--
-- Approach:
--   Every one of these tables is read/written exclusively from server code
--   (tRPC routers using Prisma, or the supabase-js admin client signed with
--   the service-role key). Both connection types bypass RLS, so the safest
--   thing we can do is:
--
--     1. ENABLE row level security on the table.
--     2. Add ZERO policies.
--
--   With RLS on and no policies, PostgREST (anon + authenticated JWT) gets
--   no rows / no writes for these tables — exactly what we want. Server-side
--   Prisma + the supabase admin client continue to work unchanged.
--
--   The four tables that *are* hit directly from the browser via the anon
--   Supabase client (profiles / events / messages / notifications) already
--   have appropriate policies from earlier migrations and aren't touched
--   here.

-- ----- Tables created by 00001 that we didn't RLS at the time -----

alter table if exists vendor_portfolio_items enable row level security;
alter table if exists style_quiz_sessions    enable row level security;
alter table if exists venue_designs          enable row level security;
alter table if exists venue_design_media     enable row level security;
alter table if exists inspiration_images     enable row level security;

-- ----- Payment / proposal lifecycle (server-only) -----

alter table if exists payments              enable row level security;
alter table if exists payment_schedules     enable row level security;
alter table if exists schedule_amendments   enable row level security;
alter table if exists payment_refunds       enable row level security;
alter table if exists payouts               enable row level security;
alter table if exists proposals             enable row level security;
alter table if exists planner_blocks        enable row level security;

-- ----- Vendor engagements / reviews (server-only) -----

alter table if exists vendor_engagements      enable row level security;
alter table if exists vendor_engagement_items enable row level security;
alter table if exists vendor_releases         enable row level security;
alter table if exists vendor_reviews          enable row level security;

-- ----- Prospecting pipeline (admin-only via tRPC) -----

alter table if exists prospects           enable row level security;
alter table if exists discovery_runs      enable row level security;
alter table if exists outreach_templates  enable row level security;

-- ----- Stripe webhook idempotency (server-only) -----

alter table if exists stripe_webhook_events enable row level security;

-- ----- Prisma's own bookkeeping table -----
--
-- Prisma migrations live in `public._prisma_migrations`. It's only ever
-- touched by the Prisma migration engine over the service-role/postgres
-- connection, but it still trips the same Supabase linter rule. Lock it
-- down too.
alter table if exists _prisma_migrations enable row level security;
