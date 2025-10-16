alter table public.profiles
  add column if not exists prefers_dark_mode boolean not null default false,
  add column if not exists notifications_enabled boolean not null default true;
