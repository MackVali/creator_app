-- Add Dynamic Overlay Block schema while keeping existing manual overlays valid.

alter table public.overlay_windows
  add column if not exists mode text not null default 'MANUAL',
  add column if not exists block_type text null,
  add column if not exists energy text null,
  add column if not exists location_context_id uuid null,
  add column if not exists allow_all_instance_types boolean not null default true,
  add column if not exists allow_all_skills boolean not null default true,
  add column if not exists allow_all_monuments boolean not null default true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'overlay_windows_location_context_id_fkey'
      and conrelid = 'public.overlay_windows'::regclass
  ) then
    alter table public.overlay_windows
      add constraint overlay_windows_location_context_id_fkey
        foreign key (location_context_id)
        references public.location_contexts(id)
        on delete set null;
  end if;
end
$$;

create index if not exists overlay_windows_location_context_idx
  on public.overlay_windows(location_context_id);

alter table public.overlay_windows
  drop constraint if exists overlay_windows_mode_chk;

alter table public.overlay_windows
  add constraint overlay_windows_mode_chk
    check (mode in ('MANUAL', 'DYNAMIC'));

alter table public.overlay_windows
  drop constraint if exists overlay_windows_block_type_chk;

alter table public.overlay_windows
  add constraint overlay_windows_block_type_chk
    check (block_type is null or block_type in ('FOCUS', 'BREAK', 'PRACTICE'));

alter table public.overlay_windows
  drop constraint if exists overlay_windows_energy_chk;

alter table public.overlay_windows
  add constraint overlay_windows_energy_chk
    check (energy is null or energy in ('NO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'EXTREME'));

create or replace function public.ensure_overlay_window_context_same_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  loc_user uuid;
begin
  if new.location_context_id is not null then
    select user_id into loc_user from public.location_contexts where id = new.location_context_id;
    if loc_user is null then
      raise exception 'location_context_id % does not exist', new.location_context_id;
    end if;
    if loc_user <> new.user_id then
      raise exception 'user_id must match location_context owner';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_overlay_windows_context_user on public.overlay_windows;

create trigger trg_overlay_windows_context_user
before insert or update of user_id, location_context_id
on public.overlay_windows
for each row
execute function public.ensure_overlay_window_context_same_user();

create table if not exists public.overlay_window_allowed_instance_types (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  overlay_window_id uuid not null references public.overlay_windows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_type text not null
);

alter table public.overlay_window_allowed_instance_types
  drop constraint if exists overlay_window_allowed_instance_types_instance_type_chk;

alter table public.overlay_window_allowed_instance_types
  add constraint overlay_window_allowed_instance_types_instance_type_chk
    check (instance_type in (
      'PROJECT',
      'TASK',
      'HABIT',
      'CHORE',
      'ASYNC',
      'SYNC',
      'TEMP',
      'MEMO',
      'RELAXER',
      'PRACTICE'
    ));

create unique index if not exists overlay_window_allowed_instance_types_unique_idx
  on public.overlay_window_allowed_instance_types (overlay_window_id, instance_type);

create index if not exists overlay_window_allowed_instance_types_overlay_window_idx
  on public.overlay_window_allowed_instance_types(overlay_window_id);

create table if not exists public.overlay_window_allowed_skills (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  overlay_window_id uuid not null references public.overlay_windows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade
);

create unique index if not exists overlay_window_allowed_skills_unique_idx
  on public.overlay_window_allowed_skills (overlay_window_id, skill_id);

create index if not exists overlay_window_allowed_skills_overlay_window_idx
  on public.overlay_window_allowed_skills(overlay_window_id);

create table if not exists public.overlay_window_allowed_monuments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  overlay_window_id uuid not null references public.overlay_windows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  monument_id uuid not null references public.monuments(id) on delete cascade
);

create unique index if not exists overlay_window_allowed_monuments_unique_idx
  on public.overlay_window_allowed_monuments (overlay_window_id, monument_id);

create index if not exists overlay_window_allowed_monuments_overlay_window_idx
  on public.overlay_window_allowed_monuments(overlay_window_id);

create or replace function public.ensure_overlay_window_allowed_same_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  owner uuid;
begin
  select user_id into owner from public.overlay_windows where id = new.overlay_window_id;
  if owner is null then
    raise exception 'overlay_window_id % does not exist', new.overlay_window_id;
  end if;
  if owner <> new.user_id then
    raise exception 'user_id must match overlay_window owner';
  end if;
  return new;
end;
$$;

alter table public.overlay_window_allowed_instance_types enable row level security;

drop trigger if exists trg_overlay_window_allowed_instance_types_user on public.overlay_window_allowed_instance_types;

create trigger trg_overlay_window_allowed_instance_types_user
before insert or update of user_id, overlay_window_id
on public.overlay_window_allowed_instance_types
for each row
execute function public.ensure_overlay_window_allowed_same_user();

drop policy if exists "overlay_window_allowed_instance_types_select_own" on public.overlay_window_allowed_instance_types;
drop policy if exists "overlay_window_allowed_instance_types_insert_own" on public.overlay_window_allowed_instance_types;
drop policy if exists "overlay_window_allowed_instance_types_update_own" on public.overlay_window_allowed_instance_types;
drop policy if exists "overlay_window_allowed_instance_types_delete_own" on public.overlay_window_allowed_instance_types;

create policy "overlay_window_allowed_instance_types_select_own" on public.overlay_window_allowed_instance_types
  for select using (auth.uid() = user_id);

create policy "overlay_window_allowed_instance_types_insert_own" on public.overlay_window_allowed_instance_types
  for insert with check (auth.uid() = user_id);

create policy "overlay_window_allowed_instance_types_update_own" on public.overlay_window_allowed_instance_types
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "overlay_window_allowed_instance_types_delete_own" on public.overlay_window_allowed_instance_types
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.overlay_window_allowed_instance_types to authenticated;

alter table public.overlay_window_allowed_skills enable row level security;

drop trigger if exists trg_overlay_window_allowed_skills_user on public.overlay_window_allowed_skills;

create trigger trg_overlay_window_allowed_skills_user
before insert or update of user_id, overlay_window_id
on public.overlay_window_allowed_skills
for each row
execute function public.ensure_overlay_window_allowed_same_user();

drop policy if exists "overlay_window_allowed_skills_select_own" on public.overlay_window_allowed_skills;
drop policy if exists "overlay_window_allowed_skills_insert_own" on public.overlay_window_allowed_skills;
drop policy if exists "overlay_window_allowed_skills_update_own" on public.overlay_window_allowed_skills;
drop policy if exists "overlay_window_allowed_skills_delete_own" on public.overlay_window_allowed_skills;

create policy "overlay_window_allowed_skills_select_own" on public.overlay_window_allowed_skills
  for select using (auth.uid() = user_id);

create policy "overlay_window_allowed_skills_insert_own" on public.overlay_window_allowed_skills
  for insert with check (auth.uid() = user_id);

create policy "overlay_window_allowed_skills_update_own" on public.overlay_window_allowed_skills
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "overlay_window_allowed_skills_delete_own" on public.overlay_window_allowed_skills
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.overlay_window_allowed_skills to authenticated;

alter table public.overlay_window_allowed_monuments enable row level security;

drop trigger if exists trg_overlay_window_allowed_monuments_user on public.overlay_window_allowed_monuments;

create trigger trg_overlay_window_allowed_monuments_user
before insert or update of user_id, overlay_window_id
on public.overlay_window_allowed_monuments
for each row
execute function public.ensure_overlay_window_allowed_same_user();

drop policy if exists "overlay_window_allowed_monuments_select_own" on public.overlay_window_allowed_monuments;
drop policy if exists "overlay_window_allowed_monuments_insert_own" on public.overlay_window_allowed_monuments;
drop policy if exists "overlay_window_allowed_monuments_update_own" on public.overlay_window_allowed_monuments;
drop policy if exists "overlay_window_allowed_monuments_delete_own" on public.overlay_window_allowed_monuments;

create policy "overlay_window_allowed_monuments_select_own" on public.overlay_window_allowed_monuments
  for select using (auth.uid() = user_id);

create policy "overlay_window_allowed_monuments_insert_own" on public.overlay_window_allowed_monuments
  for insert with check (auth.uid() = user_id);

create policy "overlay_window_allowed_monuments_update_own" on public.overlay_window_allowed_monuments
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "overlay_window_allowed_monuments_delete_own" on public.overlay_window_allowed_monuments
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.overlay_window_allowed_monuments to authenticated;
