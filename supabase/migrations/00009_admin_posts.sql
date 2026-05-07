-- Admin-generated social post carousels.
--
-- A `posts` row captures everything the generator produces for one
-- carousel (format, vibe, palette, mirrored inspiration urls, generated
-- render urls, ordered slide list, caption + 5 hashtags) plus a triage
-- status (pending / published / discarded). The `slides` column is the
-- rendered carousel as `{ component_name, props, rendered_png_url }[]`.
--
-- Publishing is intentionally a status-flip only — the operator posts
-- the rasterized PNGs to Instagram/TikTok manually from a phone. There
-- is no auto-poster.
--
-- All access is admin-only. Like the other admin-only tables in this
-- schema we don't write RLS policies for non-admin roles; mutations go
-- through tRPC + Prisma using the service-role connection (which bypasses
-- RLS) and are gated by `assertAdmin(ctx.user.id)` at the procedure
-- boundary.

begin;

-- ----- 1) Enums -----
do $$
begin
  if not exists (select 1 from pg_type where typname = 'PostStatus') then
    create type "PostStatus" as enum ('pending', 'published', 'discarded');
  end if;
  if not exists (select 1 from pg_type where typname = 'PostFormat') then
    create type "PostFormat" as enum (
      'inspo_to_render',
      'palette_test',
      'real_bride',
      'planner_pov',
      'three_words'
    );
  end if;
end$$;

-- ----- 2) Table -----
create table if not exists posts (
  id     uuid primary key default gen_random_uuid(),
  status "PostStatus" not null default 'pending',
  format "PostFormat" not null,
  vibe   text not null,

  -- See src/types/posts.ts NamedPalette
  palette jsonb not null,

  -- { partner_a: string, partner_b: string }
  couple_names jsonb not null,

  -- string[] of 6-8 mirrored Cloudinary URLs
  inspiration_image_urls jsonb not null default '[]'::jsonb,

  -- string[] of 1-4 Cloudinary URLs (format-dependent)
  render_image_urls jsonb not null default '[]'::jsonb,

  -- SlideRecord[] (component_name, props, rendered_png_url)
  slides jsonb not null default '[]'::jsonb,

  caption  text not null,
  -- Exactly 5 entries; constraint enforced at the JSON-array level.
  hashtags jsonb not null,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,

  constraint posts_hashtags_count check (
    jsonb_typeof(hashtags) = 'array' and jsonb_array_length(hashtags) = 5
  ),
  constraint posts_palette_object check (jsonb_typeof(palette) = 'object'),
  constraint posts_couple_names_object check (jsonb_typeof(couple_names) = 'object'),
  constraint posts_slides_array check (jsonb_typeof(slides) = 'array'),
  constraint posts_inspiration_array check (jsonb_typeof(inspiration_image_urls) = 'array'),
  constraint posts_renders_array check (jsonb_typeof(render_image_urls) = 'array')
);

create index if not exists posts_status_created_at_idx
  on posts (status, created_at desc);

-- Keep updated_at fresh on every row mutation. Same trigger pattern as
-- elsewhere in the schema.
create or replace function set_posts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists posts_set_updated_at on posts;
create trigger posts_set_updated_at
  before update on posts
  for each row
  execute function set_posts_updated_at();

-- ----- 3) RLS -----
alter table posts enable row level security;

-- Default-deny for anon/authenticated. Admin tRPC writes use the
-- service-role connection which bypasses RLS — same pattern as
-- vision_pack_pricing and the other admin-only tables.

commit;
