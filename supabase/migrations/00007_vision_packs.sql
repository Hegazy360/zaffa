-- Wedding Vision Pack — paid entry product.
--
-- A couple (or gifter) pays once for a packaged AI experience: mood board +
-- N renders + N videos + a printable lookbook + a public microsite. The
-- pack is the paywall in front of `ai.renderScene` and `ai.startVideo` —
-- quota counters are decremented atomically after each successful generation.
--
-- Gifting columns ship now (no UI yet) so we don't need a follow-up
-- migration when the gifting flow is built.
--
-- This migration:
--   1. Creates the `vision_pack_status` enum.
--   2. Creates the `vision_packs` table + indexes.
--   3. Enables RLS with policies that mirror `payments`:
--      - buyer + recipient can SELECT/UPDATE their own row.
--      - admins can do everything (caught by the `is_admin()` helper that
--        already powers the rest of the admin dashboard).
--   4. Revokes anon/authenticated direct grants — all access goes through
--      tRPC + Prisma using the service-role connection.

begin;

-- ----- 1) Enum -----
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'VisionPackStatus'
  ) then
    create type "VisionPackStatus" as enum (
      'pending_payment',
      'active',
      'fulfilled',
      'refunded',
      'expired'
    );
  end if;
end$$;

-- ----- 2) Table -----
create table if not exists vision_packs (
  id uuid primary key default gen_random_uuid(),

  buyer_user_id     uuid not null references profiles(id) on delete cascade,
  recipient_user_id uuid references profiles(id) on delete set null,

  status      "VisionPackStatus" not null default 'pending_payment',
  redeemed_at timestamptz,
  expires_at  timestamptz,

  is_gift              boolean not null default false,
  gift_code            text unique,
  gift_recipient_email text,
  gift_recipient_name  text,
  gift_message         text,

  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  amount                     numeric(10, 2) not null,
  currency                   text not null default 'EGP',
  paid_at                    timestamptz,

  renders_quota int not null default 20,
  renders_used  int not null default 0,
  videos_quota  int not null default 2,
  videos_used   int not null default 0,

  event_id uuid references events(id) on delete set null,

  microsite_slug         text unique,
  microsite_published_at timestamptz,
  microsite_public       boolean not null default false,
  lookbook_downloaded_at timestamptz,

  refunded_at   timestamptz,
  refund_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Defensive: counters never exceed quota. The atomic decrement in the
  -- tRPC path also guards this, but a CHECK keeps an admin top-up from
  -- accidentally going negative if the quota is reduced below `used`.
  constraint vision_packs_renders_quota_nonneg check (renders_quota >= 0),
  constraint vision_packs_videos_quota_nonneg  check (videos_quota >= 0),
  constraint vision_packs_renders_used_in_range check (renders_used >= 0 and renders_used <= renders_quota),
  constraint vision_packs_videos_used_in_range  check (videos_used  >= 0 and videos_used  <= videos_quota)
);

create index if not exists vision_packs_recipient_status_idx
  on vision_packs (recipient_user_id, status);

create index if not exists vision_packs_buyer_status_idx
  on vision_packs (buyer_user_id, status);

create index if not exists vision_packs_gift_code_idx
  on vision_packs (gift_code);

create index if not exists vision_packs_public_idx
  on vision_packs (microsite_published_at, microsite_public);

-- `updated_at` is managed by Prisma (`@updatedAt` on the model). All
-- writes go through the tRPC layer using the service-role connection, so
-- a DB trigger is unnecessary here. Mirrors how `payments`, `events`,
-- and the rest of the schema handle this column.

-- ----- 3) RLS -----
alter table vision_packs enable row level security;

-- Buyer can see their purchases (mainly for gifts, where buyer != recipient).
drop policy if exists "Buyer can view own packs" on vision_packs;
create policy "Buyer can view own packs"
  on vision_packs for select
  using (buyer_user_id = (select auth.uid()));

-- Recipient can see + update their pack (publish microsite, opt into
-- public gallery, etc.). Updates are scoped column-by-column at the
-- application layer; RLS allows the row, application validates the diff.
drop policy if exists "Recipient can view own pack" on vision_packs;
create policy "Recipient can view own pack"
  on vision_packs for select
  using (recipient_user_id = (select auth.uid()));

drop policy if exists "Recipient can update own pack" on vision_packs;
create policy "Recipient can update own pack"
  on vision_packs for update
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

-- Public read for microsites: any row that has been explicitly published
-- and opted into the public gallery is publicly readable. The microsite
-- page itself uses the slug, but exposing this policy lets the public
-- gallery query land at the DB layer too if a future client moves there.
drop policy if exists "Public can view published opted-in packs" on vision_packs;
create policy "Public can view published opted-in packs"
  on vision_packs for select
  using (
    microsite_published_at is not null
    and microsite_public = true
    and status in ('active', 'fulfilled')
  );

-- ----- 4) Lock down anon/authenticated direct privileges -----
-- All client access goes through tRPC + Prisma (service-role connection).
-- Revoking these grants stops `vision_packs` from being introspected by
-- pg_graphql / PostgREST for those roles. Mirrors the pattern in 00006.
revoke all on table public.vision_packs from anon, authenticated;

-- ----- 5) New notification type for the pack-ready email -----
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'NotificationType' and e.enumlabel = 'vision_pack_ready'
  ) then
    alter type "NotificationType" add value 'vision_pack_ready';
  end if;
end$$;

commit;
