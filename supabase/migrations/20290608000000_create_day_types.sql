-- Create day_types table and link time_blocks directly to day_types
create table if not exists public.day_types (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false
);

-- Only one default day type per user
create unique index if not exists day_types_default_per_user_idx
  on public.day_types (user_id)
  where is_default;

-- Link time blocks to a day type (optional so existing blocks still valid)
alter table public.time_blocks
  add column if not exists day_type_id uuid references public.day_types(id) on delete cascade;

create index if not exists time_blocks_day_type_id_idx on public.time_blocks(day_type_id);

-- Enforce ownership alignment between time_blocks and day_types via trigger (no subqueries in CHECK)
create or replace function public.ensure_time_block_day_type_same_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  day_type_user uuid;
begin
  if new.day_type_id is null then
    return new;
  end if;

  select user_id into day_type_user from public.day_types where id = new.day_type_id;

  if day_type_user is null then
    raise exception 'day_type_id % does not exist', new.day_type_id;
  end if;

  if day_type_user <> new.user_id then
    raise exception 'time_block user_id must match day_type user_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_time_blocks_day_type_user on public.time_blocks;

create trigger trg_time_blocks_day_type_user
before insert or update of day_type_id, user_id
on public.time_blocks
for each row
execute function public.ensure_time_block_day_type_same_user();

alter table public.day_types enable row level security;

-- day_types policies
drop policy if exists "day_types_select_own" on public.day_types;
drop policy if exists "day_types_insert_own" on public.day_types;
drop policy if exists "day_types_update_own" on public.day_types;
drop policy if exists "day_types_delete_own" on public.day_types;

create policy "day_types_select_own" on public.day_types
  for select using (auth.uid() = user_id);

create policy "day_types_insert_own" on public.day_types
  for insert with check (auth.uid() = user_id);

create policy "day_types_update_own" on public.day_types
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "day_types_delete_own" on public.day_types
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.day_types to authenticated;
