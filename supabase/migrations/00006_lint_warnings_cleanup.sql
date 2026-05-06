-- Address the four classes of Supabase lint *warnings* that follow naturally
-- from how 00001 / 00002 were written + how Supabase grants default privileges.
--
-- This migration:
--   1. Pins `search_path` on `match_profiles` so it isn't mutable at call time.
--   2. Revokes `EXECUTE` on the SECURITY DEFINER `handle_new_user` trigger
--      function from public/anon/authenticated. Triggers don't go through
--      EXECUTE grants, so the auth.users → profiles auto-insert keeps working.
--   3. Splits the three `FOR ALL` "manage own ..." policies into separate
--      INSERT / UPDATE / DELETE policies so they no longer overlap the public
--      `FOR SELECT … USING (true)` policies. This silences the
--      "Multiple Permissive Policies" warning across vendor_services,
--      portfolio_items, and event_vendors.
--   4. Revokes anon + authenticated table privileges on every "server-only"
--      table. Supabase grants SELECT/INSERT/UPDATE/DELETE to those roles by
--      default, which is what makes the tables show up in the auto-generated
--      GraphQL schema (and in PostgREST). Prisma and the service-role admin
--      client both connect with roles that bypass these grants, so server
--      code is unaffected.

begin;

-- =============================================================
-- 1. match_profiles: lock search_path to a known schema list.
-- =============================================================

create or replace function public.match_profiles(
  query_embedding vector(1536),
  match_table text,
  match_count int default 10
)
returns table (
  id uuid,
  similarity float
)
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if match_table = 'planner_profiles' then
    return query
    select
      planner_profiles.id,
      1 - (planner_profiles.embedding <=> query_embedding) as similarity
    from planner_profiles
    where planner_profiles.embedding is not null
    order by planner_profiles.embedding <=> query_embedding
    limit match_count;
  elsif match_table = 'vendor_profiles' then
    return query
    select
      vendor_profiles.id,
      1 - (vendor_profiles.embedding <=> query_embedding) as similarity
    from vendor_profiles
    where vendor_profiles.embedding is not null
    order by vendor_profiles.embedding <=> query_embedding
    limit match_count;
  end if;
end;
$$;

-- =============================================================
-- 2. handle_new_user: stop letting anon/authenticated EXECUTE the
--    SECURITY DEFINER trigger function directly.
-- =============================================================

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- =============================================================
-- 3. Split overlapping FOR ALL policies into per-action policies.
-- =============================================================
--
-- Each of these tables had:
--   • A public "viewable by everyone" SELECT policy.
--   • A FOR ALL "manage own ..." policy that also matched SELECT.
-- Two PERMISSIVE policies on the same (role, action) is what trips the
-- "Multiple Permissive Policies" warning. Replacing the FOR ALL with
-- discrete INSERT/UPDATE/DELETE policies preserves behaviour exactly:
-- vendors/planners can still write their own rows, and the public SELECT
-- policy is now the *only* policy applicable to SELECT.

-- ----- vendor_services -----

drop policy if exists "Vendors can manage own services" on vendor_services;

create policy "Vendors can insert own services"
  on vendor_services for insert
  with check (
    vendor_id in (
      select id from vendor_profiles where user_id = (select auth.uid())
    )
  );

create policy "Vendors can update own services"
  on vendor_services for update
  using (
    vendor_id in (
      select id from vendor_profiles where user_id = (select auth.uid())
    )
  )
  with check (
    vendor_id in (
      select id from vendor_profiles where user_id = (select auth.uid())
    )
  );

create policy "Vendors can delete own services"
  on vendor_services for delete
  using (
    vendor_id in (
      select id from vendor_profiles where user_id = (select auth.uid())
    )
  );

-- ----- portfolio_items -----

drop policy if exists "Planners can manage own portfolio" on portfolio_items;

create policy "Planners can insert own portfolio"
  on portfolio_items for insert
  with check (
    planner_id in (
      select id from planner_profiles where user_id = (select auth.uid())
    )
  );

create policy "Planners can update own portfolio"
  on portfolio_items for update
  using (
    planner_id in (
      select id from planner_profiles where user_id = (select auth.uid())
    )
  )
  with check (
    planner_id in (
      select id from planner_profiles where user_id = (select auth.uid())
    )
  );

create policy "Planners can delete own portfolio"
  on portfolio_items for delete
  using (
    planner_id in (
      select id from planner_profiles where user_id = (select auth.uid())
    )
  );

-- ----- event_vendors -----
--
-- The "Event participants can view event vendors" SELECT policy already
-- includes planners (via planner_id ∈ planner_profiles), so removing
-- planner read access from the FOR ALL policy doesn't change behaviour.

drop policy if exists "Planners can manage event vendors" on event_vendors;

create policy "Planners can insert event vendors"
  on event_vendors for insert
  with check (
    event_id in (
      select id from events
      where planner_id in (
        select id from planner_profiles where user_id = (select auth.uid())
      )
    )
  );

create policy "Planners can update event vendors"
  on event_vendors for update
  using (
    event_id in (
      select id from events
      where planner_id in (
        select id from planner_profiles where user_id = (select auth.uid())
      )
    )
  )
  with check (
    event_id in (
      select id from events
      where planner_id in (
        select id from planner_profiles where user_id = (select auth.uid())
      )
    )
  );

create policy "Planners can delete event vendors"
  on event_vendors for delete
  using (
    event_id in (
      select id from events
      where planner_id in (
        select id from planner_profiles where user_id = (select auth.uid())
      )
    )
  );

-- =============================================================
-- 4. Revoke anon/authenticated privileges on server-only tables.
-- =============================================================
--
-- Supabase's default privileges grant
-- SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on every public
-- table to anon and authenticated. RLS prevents row visibility, but
-- pg_graphql still introspects the table whenever the requesting role has
-- *any* privilege on it — that's why every table is showing up under
-- "Public/Signed-In Users Can See Object in GraphQL Schema".
--
-- For tables that no client ever queries (everything reachable only through
-- tRPC + Prisma), revoking those grants makes the table disappear from both
-- GraphQL and PostgREST for those roles. Server code uses the postgres /
-- service_role identity, which is unaffected.
--
-- Tables intentionally LEFT ALONE (clients access them via PostgREST or via
-- "viewable by everyone" RLS):
--   profiles, planner_profiles, vendor_profiles, vendor_services,
--   events, event_vendors, portfolio_items, reviews, messages, notifications

revoke all on table public.vendor_portfolio_items   from anon, authenticated;
revoke all on table public.vendor_reviews           from anon, authenticated;
revoke all on table public.vendor_engagements       from anon, authenticated;
revoke all on table public.vendor_engagement_items  from anon, authenticated;
revoke all on table public.vendor_releases          from anon, authenticated;
revoke all on table public.inspiration_images       from anon, authenticated;
revoke all on table public.style_quiz_sessions      from anon, authenticated;
revoke all on table public.venue_designs            from anon, authenticated;
revoke all on table public.venue_design_media       from anon, authenticated;
revoke all on table public.payments                 from anon, authenticated;
revoke all on table public.payment_schedules        from anon, authenticated;
revoke all on table public.schedule_amendments      from anon, authenticated;
revoke all on table public.payment_refunds          from anon, authenticated;
revoke all on table public.payouts                  from anon, authenticated;
revoke all on table public.proposals                from anon, authenticated;
revoke all on table public.planner_blocks           from anon, authenticated;
revoke all on table public.prospects                from anon, authenticated;
revoke all on table public.discovery_runs           from anon, authenticated;
revoke all on table public.outreach_templates       from anon, authenticated;
revoke all on table public.stripe_webhook_events    from anon, authenticated;

commit;
