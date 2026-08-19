create table if not exists public.area_skills (
  user_id uuid not null default auth.uid(),
  area_id text not null references public.areas(id) on update cascade on delete restrict,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (area_id, skill_id)
);

create index if not exists area_skills_user_area_idx
  on public.area_skills (user_id, area_id);

create index if not exists area_skills_user_skill_idx
  on public.area_skills (user_id, skill_id);

alter table public.area_skills enable row level security;

drop policy if exists "area_skills_select_own" on public.area_skills;
drop policy if exists "area_skills_insert_own" on public.area_skills;
drop policy if exists "area_skills_update_own" on public.area_skills;
drop policy if exists "area_skills_delete_own" on public.area_skills;

create policy "area_skills_select_own"
  on public.area_skills
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "area_skills_insert_own"
  on public.area_skills
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.skills
      where skills.id = area_skills.skill_id
        and skills.user_id = (select auth.uid())
    )
  );

create policy "area_skills_update_own"
  on public.area_skills
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.skills
      where skills.id = area_skills.skill_id
        and skills.user_id = (select auth.uid())
    )
  );

create policy "area_skills_delete_own"
  on public.area_skills
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.area_skills to authenticated;

alter table public.notes
  add column if not exists area_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notes_area_fk'
      and conrelid = 'public.notes'::regclass
  ) then
    alter table public.notes
      add constraint notes_area_fk
      foreign key (area_id)
      references public.areas(id)
      on update cascade
      on delete restrict;
  end if;
end $$;

alter table public.notes
  drop constraint if exists notes_requires_subject;

alter table public.notes
  add constraint notes_requires_subject
  check (
    monument_id is not null
    or skill_id is not null
    or area_id is not null
  );

create index if not exists notes_user_area_idx
  on public.notes (user_id, area_id, created_at)
  where area_id is not null;

alter table public.xp_events
  add column if not exists area_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'xp_events_area_id_fkey'
      and conrelid = 'public.xp_events'::regclass
  ) then
    alter table public.xp_events
      add constraint xp_events_area_id_fkey
      foreign key (area_id)
      references public.areas(id)
      on update cascade
      on delete restrict;
  end if;
end $$;

create index if not exists xp_events_user_area_idx
  on public.xp_events (user_id, area_id, created_at)
  where area_id is not null;
