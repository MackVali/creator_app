alter table public.campaigns
  add column if not exists priority_code text not null default 'LOW';

alter table public.campaigns
  drop constraint if exists campaigns_priority_code_check;

alter table public.campaigns
  add constraint campaigns_priority_code_check check (
    priority_code in ('ULTRA-CRITICAL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NO')
  );

create index if not exists idx_campaigns_user_priority_code
  on public.campaigns(user_id, priority_code);
