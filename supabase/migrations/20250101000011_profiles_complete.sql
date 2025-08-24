-- Complete profiles table setup
-- Table
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  username text unique,
  dob date,
  city text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lowercase-unique username (works even if user types caps)
drop index if exists profiles_username_ci;
create unique index if not exists profiles_username_ci on public.profiles (lower(username));

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
-- Read: public (switch to self-only if you prefer later)
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (true);
-- Insert: only self
drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self" on public.profiles
  for insert with check (auth.uid() = user_id);
-- Update: only self
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
