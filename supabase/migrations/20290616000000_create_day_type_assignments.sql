-- Track explicit per-date day type selections
create table if not exists public.day_type_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key text not null,
  day_type_id uuid not null references public.day_types(id) on delete cascade
);

create unique index if not exists day_type_assignments_user_date_key_idx
  on public.day_type_assignments (user_id, date_key);

create index if not exists day_type_assignments_day_type_idx
  on public.day_type_assignments (day_type_id);

alter table public.day_type_assignments enable row level security;

drop policy if exists "day_type_assignments_select_own" on public.day_type_assignments;
drop policy if exists "day_type_assignments_insert_own" on public.day_type_assignments;
drop policy if exists "day_type_assignments_update_own" on public.day_type_assignments;
drop policy if exists "day_type_assignments_delete_own" on public.day_type_assignments;

create policy "day_type_assignments_select_own" on public.day_type_assignments
  for select using (auth.uid() = user_id);

create policy "day_type_assignments_insert_own" on public.day_type_assignments
  for insert with check (auth.uid() = user_id);

create policy "day_type_assignments_update_own" on public.day_type_assignments
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "day_type_assignments_delete_own" on public.day_type_assignments
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.day_type_assignments to authenticated;
