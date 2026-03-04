create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  is_editor boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  excerpt text,
  content text,
  published boolean default false,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  location text,
  description text,
  song_title text,
  song_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.spotify_recent_tracks (
  played_at timestamptz not null,
  track_id text not null,
  track_name text not null,
  artists jsonb not null default '[]'::jsonb,
  album_name text,
  album_image_url text,
  track_url text,
  created_at timestamptz default now(),
  primary key (played_at, track_id)
);

create index if not exists posts_published_at_idx on public.posts (published_at desc);
create index if not exists photos_created_at_idx on public.photos (created_at desc);
create index if not exists spotify_recent_tracks_played_at_idx on public.spotify_recent_tracks (played_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.can_self_assign_editor()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'jasonlatz0@gmail.com';
$$;

create or replace function public.spotify_top_artists_last_days(
  window_days integer default 7,
  max_results integer default 5
)
returns table (
  artist_name text,
  spotify_artist_id text,
  play_count bigint,
  artist_last_played_at timestamptz
)
language sql
stable
as $$
  with artist_events as (
    select
      nullif(artist ->> 'name', '') as artist_name,
      nullif(artist ->> 'id', '') as spotify_artist_id,
      played_at
    from public.spotify_recent_tracks
    cross join lateral jsonb_array_elements(artists) as artist
    where played_at >= now() - make_interval(days => greatest(window_days, 1))
  )
  select
    artist_name,
    spotify_artist_id,
    count(*)::bigint as play_count,
    max(played_at) as artist_last_played_at
  from artist_events
  where artist_name is not null
  group by artist_name, spotify_artist_id
  order by play_count desc, artist_last_played_at desc, artist_name asc
  limit greatest(max_results, 1);
$$;

drop trigger if exists update_posts_updated_at on public.posts;
create trigger update_posts_updated_at
before update on public.posts
for each row execute procedure public.set_updated_at();

drop trigger if exists update_photos_updated_at on public.photos;
create trigger update_photos_updated_at
before update on public.photos
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.photos enable row level security;
alter table public.spotify_recent_tracks enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Profiles are editable by owner" on public.profiles;
create policy "Profiles are editable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and (
      coalesce(is_editor, false) = false
      or public.can_self_assign_editor()
    )
  );

drop policy if exists "Profiles insert by owner" on public.profiles;
create policy "Profiles insert by owner"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and (
      coalesce(is_editor, false) = false
      or public.can_self_assign_editor()
    )
  );

drop policy if exists "Public can read published posts" on public.posts;
create policy "Public can read published posts"
  on public.posts for select
  using (published = true);

drop policy if exists "Editors can manage posts" on public.posts;
create policy "Editors can manage posts"
  on public.posts for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_editor = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_editor = true
    )
  );

drop policy if exists "Public can read photos metadata" on public.photos;
create policy "Public can read photos metadata"
  on public.photos for select
  using (true);

drop policy if exists "Editors can manage photos metadata" on public.photos;
create policy "Editors can manage photos metadata"
  on public.photos for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_editor = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_editor = true
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  true,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read photos bucket" on storage.objects;
create policy "Public can read photos bucket"
  on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists "Editors can upload photos bucket" on storage.objects;
create policy "Editors can upload photos bucket"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_editor = true
    )
  );

drop policy if exists "Editors can update photos bucket" on storage.objects;
create policy "Editors can update photos bucket"
  on storage.objects for update
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_editor = true
    )
  )
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_editor = true
    )
  );

drop policy if exists "Editors can delete photos bucket" on storage.objects;
create policy "Editors can delete photos bucket"
  on storage.objects for delete
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_editor = true
    )
  );
