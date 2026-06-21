create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  kind text not null,
  entity_type text,
  entity_id uuid,
  scheduled_for timestamptz,

  sent_at timestamptz,
  status text not null default 'sent',
  error text,

  created_at timestamptz not null default now(),

  constraint push_notification_deliveries_status_check
    check (status in ('sent', 'failed', 'skipped'))
);

create unique index if not exists push_notification_deliveries_dedupe_unique
  on public.push_notification_deliveries(
    user_id,
    kind,
    coalesce(entity_type, ''),
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(scheduled_for, 'epoch'::timestamptz)
  );

create index if not exists push_notification_deliveries_user_id_idx
  on public.push_notification_deliveries(user_id);

create index if not exists push_notification_deliveries_user_kind_idx
  on public.push_notification_deliveries(user_id, kind);

create index if not exists push_notification_deliveries_scheduled_for_idx
  on public.push_notification_deliveries(scheduled_for);

alter table public.push_notification_deliveries enable row level security;

drop policy if exists "push_notification_deliveries_select_own" on public.push_notification_deliveries;
drop policy if exists "push_notification_deliveries_insert_own" on public.push_notification_deliveries;
drop policy if exists "push_notification_deliveries_update_own" on public.push_notification_deliveries;
drop policy if exists "push_notification_deliveries_delete_own" on public.push_notification_deliveries;

create policy "push_notification_deliveries_select_own"
  on public.push_notification_deliveries
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.push_notification_deliveries to service_role;
