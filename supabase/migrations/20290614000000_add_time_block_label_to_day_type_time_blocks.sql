-- Expose the time block name on day_type_time_blocks for easier debugging and UI use
alter table public.day_type_time_blocks
  add column if not exists time_block_label text;

-- Backfill from the source time_blocks table
update public.day_type_time_blocks dttb
set time_block_label = coalesce(tb.label, 'TIME BLOCK')
from public.time_blocks tb
where dttb.time_block_id = tb.id
  and (dttb.time_block_label is null or trim(dttb.time_block_label) = '');

-- Keep label in sync when the link is created/updated
create or replace function public.set_day_type_time_block_label()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  src_label text;
begin
  select label into src_label from public.time_blocks where id = new.time_block_id;
  if src_label is null then
    new.time_block_label := null;
  else
    new.time_block_label := src_label;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_day_type_time_blocks_label on public.day_type_time_blocks;

create trigger trg_day_type_time_blocks_label
before insert or update of time_block_id
on public.day_type_time_blocks
for each row
execute function public.set_day_type_time_block_label();

-- Propagate label edits on time_blocks to linked rows
create or replace function public.propagate_time_block_label_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.day_type_time_blocks
  set time_block_label = new.label
  where time_block_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_time_blocks_propagate_label on public.time_blocks;

create trigger trg_time_blocks_propagate_label
after update of label
on public.time_blocks
for each row
execute function public.propagate_time_block_label_change();
