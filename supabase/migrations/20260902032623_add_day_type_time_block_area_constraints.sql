-- Add Area support to day type time block Scope constraints.
alter table public.day_type_time_blocks
  add column if not exists allow_all_areas boolean not null default true;

create table if not exists public.day_type_time_block_allowed_areas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_type_time_block_id uuid not null references public.day_type_time_blocks(id) on delete cascade,
  area_id text not null
);

create unique index if not exists dttb_allowed_areas_unique_idx
  on public.day_type_time_block_allowed_areas (day_type_time_block_id, area_id);

create index if not exists dttb_allowed_areas_dttb_idx
  on public.day_type_time_block_allowed_areas(day_type_time_block_id);

alter table public.day_type_time_block_allowed_areas enable row level security;

drop trigger if exists trg_dttb_allowed_areas_user on public.day_type_time_block_allowed_areas;

create trigger trg_dttb_allowed_areas_user
before insert or update of user_id, day_type_time_block_id
on public.day_type_time_block_allowed_areas
for each row
execute function public.ensure_dttb_allowed_same_user();

drop policy if exists "dttb_allowed_areas_select_own" on public.day_type_time_block_allowed_areas;
drop policy if exists "dttb_allowed_areas_insert_own" on public.day_type_time_block_allowed_areas;
drop policy if exists "dttb_allowed_areas_update_own" on public.day_type_time_block_allowed_areas;
drop policy if exists "dttb_allowed_areas_delete_own" on public.day_type_time_block_allowed_areas;

create policy "dttb_allowed_areas_select_own" on public.day_type_time_block_allowed_areas
  for select using ((select auth.uid()) = user_id);

create policy "dttb_allowed_areas_insert_own" on public.day_type_time_block_allowed_areas
  for insert with check ((select auth.uid()) = user_id);

create policy "dttb_allowed_areas_update_own" on public.day_type_time_block_allowed_areas
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "dttb_allowed_areas_delete_own" on public.day_type_time_block_allowed_areas
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.day_type_time_block_allowed_areas to authenticated;
