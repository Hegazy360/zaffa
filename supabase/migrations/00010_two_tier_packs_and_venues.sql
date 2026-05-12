-- Two-tier Vision Pack + Venue directory.
--
-- This migration ships three concerns together because they're all
-- coupled to the same product change:
--
--  1. Vision Pack rows + per-country pricing get a `sku` column so we
--     can sell two packages: `wedding_design_pack_v1` ($19.99 — design,
--     microsite, PDF only) and `wedding_vision_pack_v1` ($99 — full
--     pack with planner/venue matching). Existing rows backfill to the
--     legacy SKU.
--
--  2. `vision_packs.amount` and `vision_pack_pricing.amount` switch
--     from major units to **minor units** (cents/piastres). $19.99
--     can't be expressed as an integer in major units; minor units
--     also align with Stripe's smallest-currency-unit convention.
--     Zero-decimal currencies (JPY, KRW, …) keep the same numeric
--     value — the formatting layer in
--     `src/lib/vision-pack-pricing.ts` divides by 100 only for
--     2-decimal currencies.
--
--  3. New `venues`, `venue_images`, and `event_venue_recommendations`
--     tables back the admin-curated venue directory and per-event
--     recommendations shown to higher-tier customers.
--
-- Plus one new NotificationType (`venue_lead_opened`) for the ops ping
-- when a couple expresses interest in a recommended venue.

begin;

-- ----- 1) NotificationType: venue_lead_opened -----
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'NotificationType' and e.enumlabel = 'venue_lead_opened'
  ) then
    alter type "NotificationType" add value 'venue_lead_opened';
  end if;
end$$;

-- ----- 2) Vision Pack: add `sku` column and convert `amount` to minor units -----
--
-- We backfill before changing types so the multiply-by-100 computes
-- against the correct values. Existing rows are pre-Design-Pack and
-- always priced in major units.
alter table vision_packs
  add column if not exists sku text not null default 'wedding_vision_pack_v1';

-- Drop the existing CHECKs on amount so the column type swap doesn't
-- trip the constraints; we re-add the equivalent guards below.
alter table vision_packs
  drop constraint if exists vision_packs_renders_quota_nonneg,
  drop constraint if exists vision_packs_videos_quota_nonneg,
  drop constraint if exists vision_packs_renders_used_in_range,
  drop constraint if exists vision_packs_videos_used_in_range;

-- Convert `amount` (numeric major units) -> integer minor units. EGP
-- and every currency we ship today is 2-decimal so * 100 rounds cleanly;
-- the rounding here is defensive against any historical row with more
-- than 2 decimals.
alter table vision_packs
  alter column amount type integer using round(amount * 100)::integer;

-- Re-add the quota CHECK constraints (unchanged from migration 00007).
alter table vision_packs
  add constraint vision_packs_renders_quota_nonneg check (renders_quota >= 0),
  add constraint vision_packs_videos_quota_nonneg check (videos_quota >= 0),
  add constraint vision_packs_renders_used_in_range check (
    renders_used >= 0 and renders_used <= renders_quota
  ),
  add constraint vision_packs_videos_used_in_range check (
    videos_used >= 0 and videos_used <= videos_quota
  ),
  add constraint vision_packs_amount_nonneg check (amount >= 0);

-- ----- 3) Vision Pack pricing: composite (sku, country_code) PK + minor units -----
alter table vision_pack_pricing
  add column if not exists sku text not null default 'wedding_vision_pack_v1';

-- Same minor-unit conversion as the pack rows.
alter table vision_pack_pricing
  alter column amount type integer using round(amount * 100)::integer;

-- Replace the single-column primary key with a composite (sku, country_code)
-- so each tier owns its own row per market.
alter table vision_pack_pricing
  drop constraint if exists vision_pack_pricing_pkey;

alter table vision_pack_pricing
  add constraint vision_pack_pricing_pkey primary key (sku, country_code);

-- Old amount-positive constraint phrased the floor in major units; the
-- minor-unit floor is now > 99 ≈ "more than $0.99". We keep it loose
-- (just non-negative) so admins can stage promotional pricing freely.
alter table vision_pack_pricing
  drop constraint if exists vision_pack_pricing_amount_positive;
alter table vision_pack_pricing
  add constraint vision_pack_pricing_amount_nonneg check (amount >= 0);

create index if not exists vision_pack_pricing_country_idx
  on vision_pack_pricing (country_code);

-- ----- 4) Venues directory -----
create table if not exists venues (
  id            uuid primary key default gen_random_uuid(),
  -- Future-proof column for venues self-serve; nullable + unique so we
  -- can attach a Profile without a follow-up migration.
  user_id       uuid unique references profiles(id) on delete set null,
  name          text not null,
  slug          text not null unique,
  description   text,
  country       text not null,
  city          text not null,
  address       text,
  capacity_min  integer,
  capacity_max  integer,
  price_tier    text,
  styles        jsonb not null default '[]'::jsonb,
  amenities     jsonb not null default '[]'::jsonb,
  contact_name  text,
  contact_email text,
  contact_phone text,
  website       text,
  cover_image   text,
  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint venues_country_format check (country ~ '^[A-Z]{2}$'),
  constraint venues_capacity_order check (
    capacity_min is null or capacity_max is null or capacity_min <= capacity_max
  )
);

create index if not exists venues_country_city_published_idx
  on venues (country, city, published);

create table if not exists venue_images (
  id       uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  url      text not null,
  alt      text,
  position integer not null default 0
);

create index if not exists venue_images_venue_idx
  on venue_images (venue_id, position);

create table if not exists event_venue_recommendations (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  venue_id      uuid not null references venues(id) on delete cascade,
  note          text,
  position      integer not null default 0,
  created_by    uuid not null references profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  interested_at timestamptz,
  dismissed_at  timestamptz,

  unique (event_id, venue_id)
);

create index if not exists event_venue_recs_event_idx
  on event_venue_recommendations (event_id);

-- ----- 5) RLS -----
--
-- Venues + venue_images: published rows are publicly readable so the
-- couple's event page (and any future public directory) can render
-- them without auth juggling. Writes go through the service-role
-- connection from tRPC.
alter table venues enable row level security;
alter table venue_images enable row level security;
alter table event_venue_recommendations enable row level security;

drop policy if exists "Anyone can read published venues" on venues;
create policy "Anyone can read published venues"
  on venues for select
  using (published = true);

drop policy if exists "Anyone can read venue images" on venue_images;
create policy "Anyone can read venue images"
  on venue_images for select
  using (
    exists (
      select 1 from venues v
      where v.id = venue_images.venue_id and v.published = true
    )
  );

-- Recommendations: the event's client can read their own (the
-- recommendation card lives on their event page). Everyone else (incl.
-- planners assigned to the event) reads through the service-role
-- connection in tRPC.
drop policy if exists "Client can read own event recommendations" on event_venue_recommendations;
create policy "Client can read own event recommendations"
  on event_venue_recommendations for select
  using (
    exists (
      select 1 from events e
      where e.id = event_venue_recommendations.event_id
      and e.client_id = (select auth.uid())
    )
  );

-- Direct grants. anon + authenticated can read published venues so the
-- public site can show the directory if we ever expose it. Writes are
-- never granted directly — admin tRPC uses the service-role connection.
grant select on table public.venues to anon, authenticated;
grant select on table public.venue_images to anon, authenticated;
revoke all on table public.event_venue_recommendations from anon, authenticated;

commit;
