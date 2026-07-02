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
  -- Estimated capture location for the travel globe. Filled by the geolocation
  -- pipeline (EXIF GPS → geocoded location text → open-source vision model),
  -- or overridden by hand in admin. latitude/longitude are decimal degrees.
  latitude double precision,
  longitude double precision,
  geo_place text,
  geo_region text,
  geo_country text,
  geo_confidence real,
  geo_source text check (
    geo_source is null or geo_source in ('exif', 'geocode', 'ai', 'manual')
  ),
  geo_estimated_at timestamptz,
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
  duration_ms integer,
  created_at timestamptz default now(),
  primary key (played_at, track_id)
);

-- Backfill column for databases created before duration tracking. Idempotent;
-- powers "today: N min" without a live Spotify page on the read path.
alter table public.spotify_recent_tracks
  add column if not exists duration_ms integer;

-- Backfill columns for databases created before the travel globe. Idempotent;
-- powers the photo markers + place clustering on /travel. All nullable, so this
-- is additive and safe to re-run on an existing database.
alter table public.photos
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geo_place text,
  add column if not exists geo_region text,
  add column if not exists geo_country text,
  add column if not exists geo_confidence real,
  add column if not exists geo_source text,
  add column if not exists geo_estimated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'photos_geo_source_check'
  ) then
    alter table public.photos
      add constraint photos_geo_source_check check (
        geo_source is null or geo_source in ('exif', 'geocode', 'ai', 'manual')
      );
  end if;
end $$;

create index if not exists posts_published_at_idx on public.posts (published_at desc);
create index if not exists photos_created_at_idx on public.photos (created_at desc);
-- Fast lookup of the placed photos that feed the globe.
create index if not exists photos_latitude_longitude_idx
  on public.photos (latitude, longitude)
  where latitude is not null and longitude is not null;
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

drop function if exists public.spotify_top_artists_last_days(integer, integer);
create or replace function public.spotify_top_artists_last_days(
  window_days integer default 7,
  max_results integer default 5
)
returns table (
  artist_name text,
  spotify_artist_id text,
  play_count bigint,
  artist_last_played_at timestamptz,
  artist_url text,
  artist_image_url text
)
language sql
stable
as $$
  with artist_events as (
    select
      nullif(artist ->> 'name', '') as artist_name,
      nullif(artist ->> 'id', '') as spotify_artist_id,
      coalesce(
        nullif(artist ->> 'id', ''),
        'name:' || lower(coalesce(nullif(artist ->> 'name', ''), ''))
      ) as artist_key,
      nullif(artist ->> 'url', '') as artist_url,
      nullif(spotify_recent_tracks.album_image_url, '') as artist_image_url,
      spotify_recent_tracks.played_at
    from public.spotify_recent_tracks
    cross join lateral jsonb_array_elements(artists) as artist
    where spotify_recent_tracks.played_at >= now() - make_interval(days => greatest(window_days, 1))
  ),
  filtered_events as (
    select *
    from artist_events
    where artist_name is not null
  ),
  artist_rollup as (
    select
      artist_key,
      max(artist_name) as artist_name,
      max(spotify_artist_id) as spotify_artist_id,
      count(*)::bigint as play_count,
      max(played_at) as artist_last_played_at
    from filtered_events
    group by artist_key
  ),
  latest_artist_media as (
    select distinct on (artist_key)
      artist_key,
      artist_url,
      artist_image_url
    from filtered_events
    order by artist_key, played_at desc
  )
  select
    artist_rollup.artist_name,
    artist_rollup.spotify_artist_id,
    artist_rollup.play_count,
    artist_rollup.artist_last_played_at,
    latest_artist_media.artist_url,
    latest_artist_media.artist_image_url
  from artist_rollup
  left join latest_artist_media
    on latest_artist_media.artist_key = artist_rollup.artist_key
  order by
    artist_rollup.play_count desc,
    artist_rollup.artist_last_played_at desc,
    artist_rollup.artist_name asc
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

-- The Desk: public guestbook notes written on the notepad (Stage 2).
-- No public RLS policies on purpose — all reads/writes go through the
-- server API using the service role, which enforces rate limits and caps.
create table if not exists public.desk_notes (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 1 and 280),
  author text check (author is null or char_length(author) <= 40),
  ip_hash text,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists desk_notes_created_at_idx
  on public.desk_notes (created_at desc);

alter table public.desk_notes enable row level security;

-- The Desk: the world-vs-Jason chess game (Stage 3).
-- One row with status='active' at a time; finished games stay as the archive.
-- No public RLS policies — all access goes through server routes (service
-- role), which enforce turn order, chess.js legality, and optimistic
-- concurrency via the ply counter (update ... where ply = expected).
-- moves entries: { san, uci, fen, by: 'world' | 'jason', at, ip_hash? }
-- (ip_hash recorded for world moves, never exposed through the API).
create table if not exists public.chess_games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active'
    check (status in ('active', 'finished')),
  fen text not null,
  ply integer not null default 0,
  moves jsonb not null default '[]'::jsonb,
  world_color text not null default 'w' check (world_color in ('w', 'b')),
  result text check (result in ('world', 'jason', 'draw')),
  last_move_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chess_games_status_idx
  on public.chess_games (status, created_at desc);

alter table public.chess_games enable row level security;

-- Summer Blog: an unlisted weekly writing tracker. Jason, David, and Adrian each
-- drop a URL to a public, human-written piece every week (deadline Sunday night).
-- One row per (week_start, author). No public RLS policies — every read/write
-- goes through the service-role route (mirrors public.desk_notes), which also
-- enforces the shared editing passcode (SUMMER_BLOG_PASSCODE).
create table if not exists public.summer_blog_entries (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  author text not null check (author in ('jason', 'david', 'adrian')),
  url text not null,
  title text check (title is null or char_length(title) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_start, author)
);

create index if not exists summer_blog_entries_week_idx
  on public.summer_blog_entries (week_start desc);

alter table public.summer_blog_entries enable row level security;
