-- Add energy column to day_type_time_blocks for storing per-block flame levels
alter table public.day_type_time_blocks
  add column if not exists energy text not null default 'NO';

-- Normalize existing rows to the default level
update public.day_type_time_blocks
set energy = coalesce(nullif(trim(energy), ''), 'NO')
where energy is null or trim(energy) = '';

-- Constrain allowed values to known flame levels
alter table public.day_type_time_blocks
  drop constraint if exists day_type_time_blocks_energy_chk;

alter table public.day_type_time_blocks
  add constraint day_type_time_blocks_energy_chk
    check (energy in ('NO','LOW','MEDIUM','HIGH','ULTRA','EXTREME'));
