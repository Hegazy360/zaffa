-- Enable pgvector extension
create extension if not exists vector;

-- Create profile trigger: auto-create profile when auth.users row is inserted
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, updated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url',
    now()
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS Policies

-- Profiles: users can read any profile, update only their own
alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on profiles for select
  using (true);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Planner profiles
alter table planner_profiles enable row level security;

create policy "Planner profiles are viewable by everyone"
  on planner_profiles for select
  using (true);

create policy "Planners can update own profile"
  on planner_profiles for update
  using (auth.uid() = user_id);

create policy "Planners can insert own profile"
  on planner_profiles for insert
  with check (auth.uid() = user_id);

-- Vendor profiles
alter table vendor_profiles enable row level security;

create policy "Vendor profiles are viewable by everyone"
  on vendor_profiles for select
  using (true);

create policy "Vendors can update own profile"
  on vendor_profiles for update
  using (auth.uid() = user_id);

create policy "Vendors can insert own profile"
  on vendor_profiles for insert
  with check (auth.uid() = user_id);

-- Vendor services
alter table vendor_services enable row level security;

create policy "Vendor services are viewable by everyone"
  on vendor_services for select
  using (true);

create policy "Vendors can manage own services"
  on vendor_services for all
  using (
    vendor_id in (
      select id from vendor_profiles where user_id = auth.uid()
    )
  );

-- Events
alter table events enable row level security;

create policy "Clients can view own events"
  on events for select
  using (
    auth.uid() = client_id
    or auth.uid() in (select user_id from planner_profiles where id = planner_id)
  );

create policy "Clients can create events"
  on events for insert
  with check (auth.uid() = client_id);

create policy "Event participants can update"
  on events for update
  using (
    auth.uid() = client_id
    or auth.uid() in (select user_id from planner_profiles where id = planner_id)
  );

-- Event vendors
alter table event_vendors enable row level security;

create policy "Event participants can view event vendors"
  on event_vendors for select
  using (
    event_id in (
      select id from events
      where client_id = auth.uid()
        or planner_id in (select id from planner_profiles where user_id = auth.uid())
    )
    or vendor_id in (select id from vendor_profiles where user_id = auth.uid())
  );

create policy "Planners can manage event vendors"
  on event_vendors for all
  using (
    event_id in (
      select id from events
      where planner_id in (select id from planner_profiles where user_id = auth.uid())
    )
  );

-- Portfolio items
alter table portfolio_items enable row level security;

create policy "Portfolio items are viewable by everyone"
  on portfolio_items for select
  using (true);

create policy "Planners can manage own portfolio"
  on portfolio_items for all
  using (
    planner_id in (select id from planner_profiles where user_id = auth.uid())
  );

-- Reviews
alter table reviews enable row level security;

create policy "Reviews are viewable by everyone"
  on reviews for select
  using (true);

create policy "Authenticated users can create reviews"
  on reviews for insert
  with check (auth.uid() = author_id);

-- Messages
alter table messages enable row level security;

create policy "Event participants can view messages"
  on messages for select
  using (
    event_id in (
      select id from events
      where client_id = auth.uid()
        or planner_id in (select id from planner_profiles where user_id = auth.uid())
    )
  );

create policy "Event participants can send messages"
  on messages for insert
  with check (
    auth.uid() = sender_id
    and event_id in (
      select id from events
      where client_id = auth.uid()
        or planner_id in (select id from planner_profiles where user_id = auth.uid())
    )
  );

-- Enable realtime for messages and events
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table events;

-- Vector similarity search function
create or replace function match_profiles(
  query_embedding vector(1536),
  match_table text,
  match_count int default 10
)
returns table (
  id uuid,
  similarity float
)
language plpgsql
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
