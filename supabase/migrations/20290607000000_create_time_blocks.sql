-- Create time_blocks table for day type composition
create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  start_local time without time zone not null,
  end_local time without time zone not null,
  days smallint[]
);

alter table public.time_blocks enable row level security;

drop policy if exists "time_blocks_select_own" on public.time_blocks;
drop policy if exists "time_blocks_insert_own" on public.time_blocks;
drop policy if exists "time_blocks_update_own" on public.time_blocks;
drop policy if exists "time_blocks_delete_own" on public.time_blocks;

create policy "time_blocks_select_own" on public.time_blocks
  for select using (auth.uid() = user_id);

create policy "time_blocks_insert_own" on public.time_blocks
  for insert with check (auth.uid() = user_id);

create policy "time_blocks_update_own" on public.time_blocks
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "time_blocks_delete_own" on public.time_blocks
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.time_blocks to authenticated;
