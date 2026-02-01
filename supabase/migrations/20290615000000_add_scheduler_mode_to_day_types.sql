-- Allow configuring scheduler mode per day type
alter table public.day_types
  add column if not exists scheduler_mode text not null default 'REGULAR';

-- Ensure scheduler_mode stays within supported values
alter table public.day_types
  drop constraint if exists day_types_scheduler_mode_chk;

alter table public.day_types
  add constraint day_types_scheduler_mode_chk
    check (scheduler_mode in ('REGULAR', 'RUSH', 'MONUMENTAL', 'SKILLED', 'REST'));
