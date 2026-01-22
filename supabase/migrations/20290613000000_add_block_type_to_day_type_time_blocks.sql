-- Add block_type to mirror window_kind semantics for day type time blocks
alter table public.day_type_time_blocks
  add column if not exists block_type text not null default 'FOCUS';

-- Constrain allowed values to the supported block types
alter table public.day_type_time_blocks
  drop constraint if exists day_type_time_blocks_block_type_chk;

alter table public.day_type_time_blocks
  add constraint day_type_time_blocks_block_type_chk
    check (block_type in ('FOCUS','BREAK','PRACTICE'));
