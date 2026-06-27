create table if not exists public.focus_pomo_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  active_item_key text,
  queue_items jsonb not null default '[]'::jsonb,
  mode text not null check (mode in ('pomo', 'stopwatch')),
  current_index integer not null default 0 check (current_index >= 0),
  started_at timestamptz,
  ends_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'canceled')),
  used_action_ids text[] not null default '{}'::text[],
  last_action_at timestamptz,
  unique (user_id, session_id)
);

create index if not exists focus_pomo_runs_user_status_idx
  on public.focus_pomo_runs (user_id, status, updated_at desc);

alter table public.focus_pomo_runs enable row level security;

drop policy if exists "focus_pomo_runs_select_own" on public.focus_pomo_runs;
drop policy if exists "focus_pomo_runs_insert_own" on public.focus_pomo_runs;
drop policy if exists "focus_pomo_runs_update_own" on public.focus_pomo_runs;
drop policy if exists "focus_pomo_runs_delete_own" on public.focus_pomo_runs;

create policy "focus_pomo_runs_select_own"
  on public.focus_pomo_runs for select to authenticated
  using (user_id = auth.uid());

create policy "focus_pomo_runs_insert_own"
  on public.focus_pomo_runs for insert to authenticated
  with check (user_id = auth.uid());

create policy "focus_pomo_runs_update_own"
  on public.focus_pomo_runs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "focus_pomo_runs_delete_own"
  on public.focus_pomo_runs for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.focus_pomo_runs to authenticated;
