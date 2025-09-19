alter table public.profiles
  add column if not exists timezone_offset_minutes integer;
