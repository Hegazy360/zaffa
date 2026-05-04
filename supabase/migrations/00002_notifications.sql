-- Notifications system
--
-- Adds the `notifications` table + associated enum, plus new columns on
-- `profiles` (email_unsubscribed_at) and `planner_profiles`
-- (service_country, service_cities) that power the unsubscribe flow and the
-- "new event in your service area" fan-out.

-- ----- enum -----
create type notification_type as enum (
  -- client-facing
  'proposal_received',
  'proposal_withdrawn',
  'planner_assigned',
  'payment_schedule_proposed',
  'payment_schedule_amendment_proposed',
  'payment_paid',
  'payment_failed',
  'payment_refunded',
  'payment_due_reminder',
  'payment_overdue',
  -- planner-facing
  'event_in_service_area',
  'proposal_accepted',
  'proposal_released',
  'schedule_amendment_decided',
  'payment_received',
  'payout_received',
  'vendor_accepted_engagement',
  'vendor_declined_engagement',
  'vendor_cancelled_engagement',
  'review_received',
  -- vendor-facing
  'engagement_requested',
  'engagement_cancelled',
  'engagement_items_updated',
  -- shared (event thread)
  'message_received'
);

-- ----- profiles -----
alter table profiles
  add column if not exists email_unsubscribed_at timestamptz;

-- ----- planner_profiles -----
alter table planner_profiles
  add column if not exists service_country text not null default 'EG',
  add column if not exists service_cities jsonb not null default '[]'::jsonb;

-- ----- notifications table -----
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  link text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_read_created_idx
  on notifications (user_id, read_at, created_at desc);
create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);
create index if not exists notifications_type_created_idx
  on notifications (type, created_at desc);

-- ----- RLS -----
alter table notifications enable row level security;

-- Users can only read their own notifications. No public reads.
create policy "Users read own notifications"
  on notifications for select
  using (auth.uid() = user_id);

-- Users can mark their own notifications read/deleted. All INSERTs happen
-- server-side through service-role credentials (the tRPC backend).
create policy "Users update own notifications"
  on notifications for update
  using (auth.uid() = user_id);

create policy "Users delete own notifications"
  on notifications for delete
  using (auth.uid() = user_id);

-- Publish inserts/updates to Supabase Realtime so the in-app bell can
-- subscribe to postgres_changes for its own notifications.
alter publication supabase_realtime add table notifications;
