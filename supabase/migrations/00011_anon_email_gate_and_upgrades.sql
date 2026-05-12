-- Anonymous render flow + email gate + upgrade plumbing.
--
-- Three concerns ship together because they all support the
-- anonymous-traffic / email-gate / paid-upgrade journey:
--
--   1. `profiles` gets columns to track anonymous identity and the
--      uniqueness of free-tier email captures so a single email can't
--      burn through multiple free renders across browsers.
--
--   2. `venue_design_media` gets `cloudinary_public_id` so the render
--      API can derive both the watermarked free-tier URL and the clean
--      paid-tier URL from the same row without re-rendering on upgrade.
--
--   3. `vision_packs` gets `purchase_country` (so an upgrade resolves
--      the destination tier price in the original market) and a sibling
--      `vision_pack_upgrades` table tracking the delta-charge audit
--      trail. The `wedding_free_taste_v1` SKU is granted server-side
--      with `amount = 0`; we relax the existing amount-positive check
--      to allow that.
--
--   4. `email_capture_events` records every email gate submission for
--      analytics + reconciliation against Resend Audiences.

begin;

-- ----- 1) Profiles: anonymous flag + free-render email lock -----

alter table profiles
  add column if not exists is_anonymous boolean not null default false;

-- Lowercased email used for the free render. Stored separately from
-- auth.users.email because Supabase upgrades the email later and we
-- want the original capture to be enforceable as a uniqueness key from
-- the moment we send the magic link. Nullable + partial unique index
-- (`where free_render_email is not null`) so the existing user base
-- isn't constrained.
alter table profiles
  add column if not exists free_render_email text;

create unique index if not exists profiles_free_render_email_uniq
  on profiles (free_render_email)
  where free_render_email is not null;

create index if not exists profiles_is_anonymous_idx
  on profiles (is_anonymous, created_at);

-- ----- 2) Venue design media: Cloudinary public id -----

alter table venue_design_media
  add column if not exists cloudinary_public_id text;

-- ----- 3) Vision packs: purchase country + upgrade ledger -----

-- Stamped at checkout time on the pack row. Resolved from the same geo
-- signal `vision-packs.startCheckout` uses; immutable thereafter. The
-- delta-priced upgrade flow uses it to look up the matching `to_sku`
-- price in the original market so a US buyer who later moves to EG
-- still pays the USD delta.
alter table vision_packs
  add column if not exists purchase_country varchar(8);

-- The free-tier SKU is granted with `amount = 0`. The existing CHECK
-- already allows >= 0; nothing to relax. Document the invariant.
comment on column vision_packs.amount is
  'Minor units (e.g. 1999 for $19.99). 0 for the free email-gated tier.';

create table if not exists vision_pack_upgrades (
  id                       uuid primary key default gen_random_uuid(),
  pack_id                  uuid not null references vision_packs(id) on delete cascade,
  from_sku                 text not null,
  to_sku                   text not null,
  -- Minor units in `currency`. Always >= 0 (no negative deltas).
  amount_charged           integer not null,
  currency                 char(3) not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  -- pending_payment | active | failed
  status                   text not null default 'pending_payment',
  paid_at                  timestamptz,
  created_at               timestamptz not null default now(),

  constraint vision_pack_upgrades_amount_nonneg check (amount_charged >= 0)
);

create index if not exists vision_pack_upgrades_pack_idx
  on vision_pack_upgrades (pack_id, created_at desc);

alter table vision_pack_upgrades enable row level security;

-- Recipient can read their own upgrade rows (UI surfaces them in the
-- billing history). Writes always go through the service-role tRPC
-- connection.
drop policy if exists "Recipient can read own pack upgrades" on vision_pack_upgrades;
create policy "Recipient can read own pack upgrades"
  on vision_pack_upgrades for select
  using (
    exists (
      select 1 from vision_packs p
      where p.id = vision_pack_upgrades.pack_id
      and p.recipient_user_id = (select auth.uid())
    )
  );

revoke all on table public.vision_pack_upgrades from anon, authenticated;

-- ----- 4) Email capture events -----

create table if not exists email_capture_events (
  id          uuid primary key default gen_random_uuid(),
  -- The anonymous Supabase user id at capture time. The user may
  -- subsequently upgrade to a permanent account with this email;
  -- preserving the original id here keeps the capture event linkable
  -- to the design + render even after the upgrade flow runs.
  anon_user_id uuid not null references profiles(id) on delete cascade,
  email        text not null,
  ip           text,
  country      text,
  design_id    uuid references venue_designs(id) on delete set null,
  render_id    uuid references venue_design_media(id) on delete set null,
  -- pending | sent | confirmed | failed — driven by the magic-link
  -- send + verifyOtp pipeline. Lets the reconcile cron retry pushes
  -- to Resend Audiences for captures that failed first time.
  status       text not null default 'pending',
  resend_synced_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists email_capture_events_anon_idx
  on email_capture_events (anon_user_id, created_at desc);

create index if not exists email_capture_events_status_idx
  on email_capture_events (status, created_at);

alter table email_capture_events enable row level security;
revoke all on table public.email_capture_events from anon, authenticated;

-- ----- 5) Trigger update: mirror is_anonymous on profile creation -----
--
-- The existing `handle_new_user` trigger creates a profile row from
-- every auth.users insert. Anonymous Supabase users have
-- `is_anonymous = true` on the auth row; we mirror that onto the
-- profile so admin queries + filters don't need to join into
-- auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, is_anonymous, updated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, new.id::text),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.is_anonymous, false),
    now()
  );
  return new;
end;
$$;

-- And mirror the flag on update when Supabase upgrades the anon user
-- to a permanent account (is_anonymous flips from true to false).
create or replace function public.handle_user_upgrade()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if old.is_anonymous is distinct from new.is_anonymous then
    update public.profiles
      set is_anonymous = coalesce(new.is_anonymous, false),
          updated_at = now()
      where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_upgraded on auth.users;
create trigger on_auth_user_upgraded
  after update on auth.users
  for each row execute procedure public.handle_user_upgrade();

commit;
