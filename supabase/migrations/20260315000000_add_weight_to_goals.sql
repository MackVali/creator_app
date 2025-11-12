-- Add weight column to goals for sorting and display
alter table public.goals
  add column if not exists weight integer not null default 0;

-- Track boost value applied via UI button
alter table public.goals
  add column if not exists weight_boost integer not null default 0;
