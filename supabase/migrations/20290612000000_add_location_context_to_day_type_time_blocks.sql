-- Add per-link location context to day_type_time_blocks (mirrors windows)
alter table public.day_type_time_blocks
  add column if not exists location_context_id uuid references public.location_contexts(id) on delete set null;

create index if not exists day_type_time_blocks_location_context_idx
  on public.day_type_time_blocks(location_context_id);

-- Keep user alignment across linked tables (day type, time block, location context)
create or replace function public.ensure_day_type_time_block_same_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  dt_user uuid;
  block_user uuid;
  loc_user uuid;
begin
  select user_id into dt_user from public.day_types where id = new.day_type_id;
  if dt_user is null then
    raise exception 'day_type_id % does not exist', new.day_type_id;
  end if;

  select user_id into block_user from public.time_blocks where id = new.time_block_id;
  if block_user is null then
    raise exception 'time_block_id % does not exist', new.time_block_id;
  end if;

  if new.location_context_id is not null then
    select user_id into loc_user from public.location_contexts where id = new.location_context_id;
    if loc_user is null then
      raise exception 'location_context_id % does not exist', new.location_context_id;
    end if;
  end if;

  if dt_user <> new.user_id or block_user <> new.user_id or (loc_user is not null and loc_user <> new.user_id) then
    raise exception 'user_id must match day_type, time_block, and location_context owners';
  end if;

  return new;
end;
$$;

-- Trigger already exists; recreate to ensure updated function is used
drop trigger if exists trg_day_type_time_blocks_user on public.day_type_time_blocks;

create trigger trg_day_type_time_blocks_user
before insert or update of user_id, day_type_id, time_block_id, location_context_id
on public.day_type_time_blocks
for each row
execute function public.ensure_day_type_time_block_same_user();
