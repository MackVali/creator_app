-- Create join table for associating day types with reusable time blocks
create table if not exists public.day_type_time_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_type_id uuid not null references public.day_types(id) on delete cascade,
  time_block_id uuid not null references public.time_blocks(id) on delete cascade
);

create unique index if not exists day_type_time_blocks_unique_idx
  on public.day_type_time_blocks (day_type_id, time_block_id);

create index if not exists day_type_time_blocks_day_type_idx on public.day_type_time_blocks(day_type_id);
create index if not exists day_type_time_blocks_time_block_idx on public.day_type_time_blocks(time_block_id);

create or replace function public.ensure_day_type_time_block_same_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  dt_user uuid;
  block_user uuid;
begin
  select user_id into dt_user from public.day_types where id = new.day_type_id;
  if dt_user is null then
    raise exception 'day_type_id % does not exist', new.day_type_id;
  end if;

  select user_id into block_user from public.time_blocks where id = new.time_block_id;
  if block_user is null then
    raise exception 'time_block_id % does not exist', new.time_block_id;
  end if;

  if dt_user <> new.user_id or block_user <> new.user_id then
    raise exception 'user_id must match day_type and time_block owners';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_day_type_time_blocks_user on public.day_type_time_blocks;

create trigger trg_day_type_time_blocks_user
before insert or update of user_id, day_type_id, time_block_id
on public.day_type_time_blocks
for each row
execute function public.ensure_day_type_time_block_same_user();

alter table public.day_type_time_blocks enable row level security;

drop policy if exists "day_type_time_blocks_select_own" on public.day_type_time_blocks;
drop policy if exists "day_type_time_blocks_insert_own" on public.day_type_time_blocks;
drop policy if exists "day_type_time_blocks_update_own" on public.day_type_time_blocks;
drop policy if exists "day_type_time_blocks_delete_own" on public.day_type_time_blocks;

create policy "day_type_time_blocks_select_own" on public.day_type_time_blocks
  for select using (auth.uid() = user_id);

create policy "day_type_time_blocks_insert_own" on public.day_type_time_blocks
  for insert with check (auth.uid() = user_id);

create policy "day_type_time_blocks_update_own" on public.day_type_time_blocks
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "day_type_time_blocks_delete_own" on public.day_type_time_blocks
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.day_type_time_blocks to authenticated;
