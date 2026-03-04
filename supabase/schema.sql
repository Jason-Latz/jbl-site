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

create index if not exists posts_published_at_idx on public.posts (published_at desc);

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

drop trigger if exists update_posts_updated_at on public.posts;
create trigger update_posts_updated_at
before update on public.posts
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;

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
