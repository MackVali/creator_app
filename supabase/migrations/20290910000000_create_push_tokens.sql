create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  token_type text not null default 'fcm',
  device_id text,
  app_version text,
  build_number text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint push_tokens_platform_check
    check (platform in ('ios', 'android', 'web')),

  constraint push_tokens_token_type_check
    check (token_type in ('fcm', 'apns'))
);

create unique index if not exists push_tokens_user_token_unique
  on public.push_tokens(user_id, token);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens(user_id);

create index if not exists push_tokens_enabled_user_id_idx
  on public.push_tokens(user_id)
  where enabled = true;

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
drop policy if exists "push_tokens_insert_own" on public.push_tokens;
drop policy if exists "push_tokens_update_own" on public.push_tokens;
drop policy if exists "push_tokens_delete_own" on public.push_tokens;

create policy "push_tokens_select_own"
  on public.push_tokens
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "push_tokens_insert_own"
  on public.push_tokens
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "push_tokens_update_own"
  on public.push_tokens
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "push_tokens_delete_own"
  on public.push_tokens
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
