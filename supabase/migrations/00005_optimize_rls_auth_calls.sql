-- Optimize existing RLS policies to use `(select auth.uid())` instead of
-- `auth.uid()`.
--
-- Background:
--   Supabase's database linter raises rule 0003_auth_rls_initplan on every
--   policy that calls `auth.uid()` (or `current_setting()`) directly in
--   `USING` / `WITH CHECK`. Postgres re-evaluates such function calls once
--   per row. Wrapping the call in a scalar subquery — `(select auth.uid())`
--   — turns it into an InitPlan that runs once per query, which is the
--   pattern Supabase recommends for production.
--
-- Approach:
--   This migration drops and recreates every policy defined in 00001 +
--   00002 with the InitPlan-friendly form. Policy names and behaviour are
--   preserved exactly; only the expression changes. Tables added in 00004
--   have RLS enabled but no policies, so nothing to do for those.
--
-- Safety:
--   `drop policy if exists` makes each block idempotent. There is a brief
--   window between drop + create where the policy is absent, but the
--   surrounding statement runs in a single migration transaction, so no
--   request can observe the gap.

begin;

-- ============================================================
-- profiles
-- ============================================================

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update
  using ((select auth.uid()) = id);

-- ============================================================
-- planner_profiles
-- ============================================================

drop policy if exists "Planners can update own profile" on planner_profiles;
create policy "Planners can update own profile"
  on planner_profiles for update
  using ((select auth.uid()) = user_id);

drop policy if exists "Planners can insert own profile" on planner_profiles;
create policy "Planners can insert own profile"
  on planner_profiles for insert
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- vendor_profiles
-- ============================================================

drop policy if exists "Vendors can update own profile" on vendor_profiles;
create policy "Vendors can update own profile"
  on vendor_profiles for update
  using ((select auth.uid()) = user_id);

drop policy if exists "Vendors can insert own profile" on vendor_profiles;
create policy "Vendors can insert own profile"
  on vendor_profiles for insert
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- vendor_services
-- ============================================================

drop policy if exists "Vendors can manage own services" on vendor_services;
create policy "Vendors can manage own services"
  on vendor_services for all
  using (
    vendor_id in (
      select id from vendor_profiles where user_id = (select auth.uid())
    )
  );

-- ============================================================
-- events
-- ============================================================

drop policy if exists "Clients can view own events" on events;
create policy "Clients can view own events"
  on events for select
  using (
    (select auth.uid()) = client_id
    or (select auth.uid()) in (select user_id from planner_profiles where id = planner_id)
  );

drop policy if exists "Clients can create events" on events;
create policy "Clients can create events"
  on events for insert
  with check ((select auth.uid()) = client_id);

drop policy if exists "Event participants can update" on events;
create policy "Event participants can update"
  on events for update
  using (
    (select auth.uid()) = client_id
    or (select auth.uid()) in (select user_id from planner_profiles where id = planner_id)
  );

-- ============================================================
-- event_vendors
-- ============================================================

drop policy if exists "Event participants can view event vendors" on event_vendors;
create policy "Event participants can view event vendors"
  on event_vendors for select
  using (
    event_id in (
      select id from events
      where client_id = (select auth.uid())
        or planner_id in (select id from planner_profiles where user_id = (select auth.uid()))
    )
    or vendor_id in (select id from vendor_profiles where user_id = (select auth.uid()))
  );

drop policy if exists "Planners can manage event vendors" on event_vendors;
create policy "Planners can manage event vendors"
  on event_vendors for all
  using (
    event_id in (
      select id from events
      where planner_id in (select id from planner_profiles where user_id = (select auth.uid()))
    )
  );

-- ============================================================
-- portfolio_items
-- ============================================================

drop policy if exists "Planners can manage own portfolio" on portfolio_items;
create policy "Planners can manage own portfolio"
  on portfolio_items for all
  using (
    planner_id in (select id from planner_profiles where user_id = (select auth.uid()))
  );

-- ============================================================
-- reviews
-- ============================================================

drop policy if exists "Authenticated users can create reviews" on reviews;
create policy "Authenticated users can create reviews"
  on reviews for insert
  with check ((select auth.uid()) = author_id);

-- ============================================================
-- messages
-- ============================================================

drop policy if exists "Event participants can view messages" on messages;
create policy "Event participants can view messages"
  on messages for select
  using (
    event_id in (
      select id from events
      where client_id = (select auth.uid())
        or planner_id in (select id from planner_profiles where user_id = (select auth.uid()))
    )
  );

drop policy if exists "Event participants can send messages" on messages;
create policy "Event participants can send messages"
  on messages for insert
  with check (
    (select auth.uid()) = sender_id
    and event_id in (
      select id from events
      where client_id = (select auth.uid())
        or planner_id in (select id from planner_profiles where user_id = (select auth.uid()))
    )
  );

-- ============================================================
-- notifications
-- ============================================================

drop policy if exists "Users read own notifications" on notifications;
create policy "Users read own notifications"
  on notifications for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users update own notifications" on notifications;
create policy "Users update own notifications"
  on notifications for update
  using ((select auth.uid()) = user_id);

drop policy if exists "Users delete own notifications" on notifications;
create policy "Users delete own notifications"
  on notifications for delete
  using ((select auth.uid()) = user_id);

commit;
