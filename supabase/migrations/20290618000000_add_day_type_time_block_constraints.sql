-- Add constraint flags to day_type_time_blocks for per-window filtering
alter table public.day_type_time_blocks
  add column if not exists allow_all_habit_types boolean not null default true,
  add column if not exists allow_all_skills boolean not null default true,
  add column if not exists allow_all_monuments boolean not null default true;

-- Whitelists for allowed habit types per day_type_time_block
create table if not exists public.day_type_time_block_allowed_habit_types (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_type_time_block_id uuid not null references public.day_type_time_blocks(id) on delete cascade,
  habit_type text not null
);

create unique index if not exists dttb_allowed_habit_types_unique_idx
  on public.day_type_time_block_allowed_habit_types (day_type_time_block_id, habit_type);

create index if not exists dttb_allowed_habit_types_dttb_idx
  on public.day_type_time_block_allowed_habit_types(day_type_time_block_id);

-- Whitelists for allowed skills per day_type_time_block
create table if not exists public.day_type_time_block_allowed_skills (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_type_time_block_id uuid not null references public.day_type_time_blocks(id) on delete cascade,
  skill_id uuid not null
);

create unique index if not exists dttb_allowed_skills_unique_idx
  on public.day_type_time_block_allowed_skills (day_type_time_block_id, skill_id);

create index if not exists dttb_allowed_skills_dttb_idx
  on public.day_type_time_block_allowed_skills(day_type_time_block_id);

-- Whitelists for allowed monuments per day_type_time_block
create table if not exists public.day_type_time_block_allowed_monuments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_type_time_block_id uuid not null references public.day_type_time_blocks(id) on delete cascade,
  monument_id uuid not null
);

create unique index if not exists dttb_allowed_monuments_unique_idx
  on public.day_type_time_block_allowed_monuments (day_type_time_block_id, monument_id);

create index if not exists dttb_allowed_monuments_dttb_idx
  on public.day_type_time_block_allowed_monuments(day_type_time_block_id);

-- Ownership alignment: ensure whitelist rows match the linked day_type_time_block user
create or replace function public.ensure_dttb_allowed_same_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  owner uuid;
begin
  select user_id into owner from public.day_type_time_blocks where id = new.day_type_time_block_id;
  if owner is null then
    raise exception 'day_type_time_block_id % does not exist', new.day_type_time_block_id;
  end if;
  if owner <> new.user_id then
    raise exception 'user_id must match day_type_time_block owner';
  end if;
  return new;
end;
$$;

-- Habit type whitelist policies and trigger
alter table public.day_type_time_block_allowed_habit_types enable row level security;

drop trigger if exists trg_dttb_allowed_habit_types_user on public.day_type_time_block_allowed_habit_types;

create trigger trg_dttb_allowed_habit_types_user
before insert or update of user_id, day_type_time_block_id
on public.day_type_time_block_allowed_habit_types
for each row
execute function public.ensure_dttb_allowed_same_user();

drop policy if exists "dttb_allowed_habit_types_select_own" on public.day_type_time_block_allowed_habit_types;
drop policy if exists "dttb_allowed_habit_types_insert_own" on public.day_type_time_block_allowed_habit_types;
drop policy if exists "dttb_allowed_habit_types_update_own" on public.day_type_time_block_allowed_habit_types;
drop policy if exists "dttb_allowed_habit_types_delete_own" on public.day_type_time_block_allowed_habit_types;

create policy "dttb_allowed_habit_types_select_own" on public.day_type_time_block_allowed_habit_types
  for select using (auth.uid() = user_id);

create policy "dttb_allowed_habit_types_insert_own" on public.day_type_time_block_allowed_habit_types
  for insert with check (auth.uid() = user_id);

create policy "dttb_allowed_habit_types_update_own" on public.day_type_time_block_allowed_habit_types
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dttb_allowed_habit_types_delete_own" on public.day_type_time_block_allowed_habit_types
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.day_type_time_block_allowed_habit_types to authenticated;

-- Skill whitelist policies and trigger
alter table public.day_type_time_block_allowed_skills enable row level security;

drop trigger if exists trg_dttb_allowed_skills_user on public.day_type_time_block_allowed_skills;

create trigger trg_dttb_allowed_skills_user
before insert or update of user_id, day_type_time_block_id
on public.day_type_time_block_allowed_skills
for each row
execute function public.ensure_dttb_allowed_same_user();

drop policy if exists "dttb_allowed_skills_select_own" on public.day_type_time_block_allowed_skills;
drop policy if exists "dttb_allowed_skills_insert_own" on public.day_type_time_block_allowed_skills;
drop policy if exists "dttb_allowed_skills_update_own" on public.day_type_time_block_allowed_skills;
drop policy if exists "dttb_allowed_skills_delete_own" on public.day_type_time_block_allowed_skills;

create policy "dttb_allowed_skills_select_own" on public.day_type_time_block_allowed_skills
  for select using (auth.uid() = user_id);

create policy "dttb_allowed_skills_insert_own" on public.day_type_time_block_allowed_skills
  for insert with check (auth.uid() = user_id);

create policy "dttb_allowed_skills_update_own" on public.day_type_time_block_allowed_skills
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dttb_allowed_skills_delete_own" on public.day_type_time_block_allowed_skills
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.day_type_time_block_allowed_skills to authenticated;

-- Monument whitelist policies and trigger
alter table public.day_type_time_block_allowed_monuments enable row level security;

drop trigger if exists trg_dttb_allowed_monuments_user on public.day_type_time_block_allowed_monuments;

create trigger trg_dttb_allowed_monuments_user
before insert or update of user_id, day_type_time_block_id
on public.day_type_time_block_allowed_monuments
for each row
execute function public.ensure_dttb_allowed_same_user();

drop policy if exists "dttb_allowed_monuments_select_own" on public.day_type_time_block_allowed_monuments;
drop policy if exists "dttb_allowed_monuments_insert_own" on public.day_type_time_block_allowed_monuments;
drop policy if exists "dttb_allowed_monuments_update_own" on public.day_type_time_block_allowed_monuments;
drop policy if exists "dttb_allowed_monuments_delete_own" on public.day_type_time_block_allowed_monuments;

create policy "dttb_allowed_monuments_select_own" on public.day_type_time_block_allowed_monuments
  for select using (auth.uid() = user_id);

create policy "dttb_allowed_monuments_insert_own" on public.day_type_time_block_allowed_monuments
  for insert with check (auth.uid() = user_id);

create policy "dttb_allowed_monuments_update_own" on public.day_type_time_block_allowed_monuments
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dttb_allowed_monuments_delete_own" on public.day_type_time_block_allowed_monuments
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.day_type_time_block_allowed_monuments to authenticated;
