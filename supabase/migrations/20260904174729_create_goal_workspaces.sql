create table if not exists public.goal_workspaces (
  goal_id uuid primary key references public.goals(id) on delete cascade,
  user_id uuid not null,
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint goal_workspaces_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists goal_workspaces_user_id_idx
  on public.goal_workspaces (user_id, updated_at desc);

alter table public.goal_workspaces enable row level security;

drop policy if exists "goal_workspaces_select_own" on public.goal_workspaces;
drop policy if exists "goal_workspaces_insert_own" on public.goal_workspaces;
drop policy if exists "goal_workspaces_update_own" on public.goal_workspaces;
drop policy if exists "goal_workspaces_delete_own" on public.goal_workspaces;

create policy "goal_workspaces_select_own"
  on public.goal_workspaces
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "goal_workspaces_insert_own"
  on public.goal_workspaces
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.goals
      where goals.id = goal_workspaces.goal_id
        and goals.user_id = (select auth.uid())
    )
  );

create policy "goal_workspaces_update_own"
  on public.goal_workspaces
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.goals
      where goals.id = goal_workspaces.goal_id
        and goals.user_id = (select auth.uid())
    )
  );

create policy "goal_workspaces_delete_own"
  on public.goal_workspaces
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.goal_workspaces to authenticated;
