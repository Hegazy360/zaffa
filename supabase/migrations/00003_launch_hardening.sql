-- Launch hardening migration:
--   1) Stripe webhook idempotency table
--   2) Payment refund ledger + partial-refund support
--   3) Dispute lifecycle columns
--   4) Account soft-deletion timestamps on profiles
--   5) `payment_disputed` notification type

-- ----- 1) Stripe webhook idempotency -----
create table if not exists stripe_webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists stripe_webhook_events_received_at_idx
  on stripe_webhook_events (received_at);

-- ----- 2) Refund ledger + partial-refund status + cumulative column -----
do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'paymentstatus'
      and exists (
        select 1 from pg_enum e where e.enumtypid = t.oid and e.enumlabel = 'partially_refunded'
      )
  ) then
    alter type "PaymentStatus" add value if not exists 'partially_refunded';
  end if;
exception when undefined_object then
  -- enum may not exist yet on a fresh seed; the create-table for payments
  -- below is the source of truth in that case.
  null;
end$$;

alter table payments
  add column if not exists refunded_amount numeric(10, 2) not null default 0,
  add column if not exists dispute_status text,
  add column if not exists dispute_resolved_at timestamptz;

create table if not exists payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  stripe_refund_id text not null unique,
  amount numeric(10, 2) not null,
  currency text not null default 'EGP',
  reason text,
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists payment_refunds_payment_id_idx
  on payment_refunds (payment_id);

-- ----- 3) Account soft-deletion timestamps on profiles -----
alter table profiles
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz;

-- ----- 4) New notification type for disputes -----
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type' and e.enumlabel = 'payment_disputed'
  ) then
    alter type notification_type add value 'payment_disputed';
  end if;
end$$;
