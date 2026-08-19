create table if not exists public.areas (
  id text primary key,
  slug text not null unique,
  label text not null,
  sort_order integer not null unique
);

alter table public.areas enable row level security;

drop policy if exists "Areas are readable by authenticated users" on public.areas;
create policy "Areas are readable by authenticated users"
  on public.areas
  for select
  to authenticated
  using (true);

grant select on table public.areas to authenticated;

insert into public.areas (id, slug, label, sort_order)
values
  ('body', 'body', 'Body', 1),
  ('mind', 'mind', 'Mind', 2),
  ('work', 'work', 'Work', 3),
  ('money', 'money', 'Money', 4),
  ('people', 'people', 'People', 5),
  ('life', 'life', 'Life', 6),
  ('creation', 'creation', 'Creation', 7),
  ('experience', 'experience', 'Experience', 8)
on conflict (id) do update
set
  slug = excluded.slug,
  label = excluded.label,
  sort_order = excluded.sort_order;

alter table public.goals
  add column if not exists area_id text;

alter table public.roadmaps
  add column if not exists area_id text;

alter table public.campaigns
  add column if not exists primary_area_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_area_id_fkey'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
      add constraint goals_area_id_fkey
      foreign key (area_id)
      references public.areas(id)
      on update cascade
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'roadmaps_area_id_fkey'
      and conrelid = 'public.roadmaps'::regclass
  ) then
    alter table public.roadmaps
      add constraint roadmaps_area_id_fkey
      foreign key (area_id)
      references public.areas(id)
      on update cascade
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaigns_primary_area_id_fkey'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_primary_area_id_fkey
      foreign key (primary_area_id)
      references public.areas(id)
      on update cascade
      on delete restrict;
  end if;
end $$;

create index if not exists goals_user_id_area_id_idx
  on public.goals (user_id, area_id)
  where area_id is not null;

create index if not exists roadmaps_user_id_area_id_idx
  on public.roadmaps (user_id, area_id)
  where area_id is not null;

create index if not exists campaigns_user_id_primary_area_id_idx
  on public.campaigns (user_id, primary_area_id)
  where primary_area_id is not null;
