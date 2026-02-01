-- Mark paint-mode day types as temporary and track their associated date/expiry
alter table public.day_types
  add column if not exists is_temporary boolean not null default false,
  add column if not exists temporary_date_key text,
  add column if not exists temporary_expires_at date;

-- Optional: enforce that temporary rows have a date key
alter table public.day_types
  drop constraint if exists day_types_temporary_key_chk;

alter table public.day_types
  add constraint day_types_temporary_key_chk
    check (is_temporary = false or (temporary_date_key is not null));

create index if not exists day_types_temporary_idx on public.day_types(is_temporary, temporary_expires_at);
