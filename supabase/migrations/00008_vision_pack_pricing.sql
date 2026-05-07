-- Vision Pack — per-country price overrides.
--
-- The seed price matrix lives in `src/lib/vision-pack-pricing.ts` (immutable
-- defaults). This table provides admin-editable overrides at runtime so
-- ops can adjust pricing for a market without a deploy.
--
-- Lookup order (resolved server-side):
--   1. `vision_pack_pricing[country_code = <ISO-2 from geo cookie>]`
--   2. `vision_pack_pricing[country_code = 'DEFAULT']`
--   3. Seed matrix in code (per country, then EU expansion, then DEFAULT)
--
-- All access goes through tRPC + Prisma using the service-role connection.
-- We grant select to authenticated for the rare case a server component
-- ever queries via the public-role client; writes are admin-only via the
-- application layer.

begin;

-- ----- 1) Table -----
create table if not exists vision_pack_pricing (
  country_code varchar(8) primary key,
  amount       integer    not null,
  currency     char(3)    not null,
  notes        text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,

  constraint vision_pack_pricing_amount_positive check (amount > 0),
  constraint vision_pack_pricing_country_format check (
    country_code = 'DEFAULT'
    or country_code ~ '^[A-Z]{2}$'
  )
);

-- ----- 2) RLS -----
alter table vision_pack_pricing enable row level security;

-- Public read: marketing surface needs to read pricing for the visitor's
-- country before login. The data is non-sensitive (price + currency).
drop policy if exists "Anyone can read pricing" on vision_pack_pricing;
create policy "Anyone can read pricing"
  on vision_pack_pricing for select
  using (true);

-- Writes are intentionally not RLS-policied (default-deny for anon/
-- authenticated). The admin dashboard writes through tRPC + Prisma using
-- the service-role connection, which bypasses RLS — same pattern as the
-- other admin-only mutations elsewhere in the schema.

-- ----- 3) Direct grants -----
-- Anonymous + authenticated need select for the public marketing surface
-- (the tRPC pricing query is `publicProcedure`, so the visitor's session
-- — anon when logged out — needs the grant).
grant select on table public.vision_pack_pricing to anon, authenticated;

commit;
